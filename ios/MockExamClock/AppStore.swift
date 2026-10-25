//
//  AppStore.swift
//  MockExamClock
//
//  全局状态与持久化。数据写入 Application Support/mockexam.json。
//  所有修改都发生在主线程（视图事件 / 主线程异步回调），保存采用原子写入。
//

import Foundation
import Combine

/// 生成 `前缀_随机串` 形式的 id
enum IDGen {
    static func make(_ prefix: String) -> String {
        let raw = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        return "\(prefix)_\(String(raw.prefix(8)))"
    }
}

final class AppStore: ObservableObject {
    @Published private(set) var settings: AppSettings
    @Published private(set) var templates: [Template]
    @Published private(set) var sessions: [ExamSession]
    /// 读盘 / 写盘失败时给用户的提示（不阻塞使用）
    @Published private(set) var loadWarning: String?

    private let fileURL: URL

    // MARK: 初始化

    init(fileURL: URL? = nil) {
        let url = fileURL ?? AppStore.defaultFileURL()
        self.fileURL = url

        var warning: String? = nil
        var loadedSettings = AppStore.makeDefaultSettings()
        var loadedTemplates = AppStore.makeDefaultTemplates()
        var loadedSessions: [ExamSession] = []

        let fileExists = FileManager.default.fileExists(atPath: url.path)
        if fileExists, let data = try? Data(contentsOf: url) {
            if let document = try? JSONDecoder().decode(AppData.self, from: data) {
                loadedSettings = document.settings
                loadedTemplates = document.templates
                loadedSessions = document.sessions
            } else {
                warning = "本地数据无法解析，已载入默认数据。"
            }
        } else if fileExists {
            warning = "本地数据读取失败，已载入默认数据。"
        }

        self.settings = loadedSettings
        self.templates = loadedTemplates
        self.sessions = loadedSessions
        self.loadWarning = warning

        repairLoadedData()
        self.sessions = AppStore.autoFinishOverdue(self.sessions, now: TimeMath.nowMs())
        persist()
    }

    // MARK: 只读查询

    var runningSession: ExamSession? {
        sessions.last(where: { $0.status == .running })
    }

    /// 记录页 / 首页计数只统计正常完成的考试（放弃的不进记录）
    var finishedSessions: [ExamSession] {
        sessions
            .filter { $0.status == .finished }
            .sorted { ($0.finishedAt ?? 0) > ($1.finishedAt ?? 0) }
    }

    var finishedCount: Int {
        sessions.filter { $0.status == .finished }.count
    }

    var dataFilePath: String {
        fileURL.path
    }

    func session(id: String) -> ExamSession? {
        sessions.first(where: { $0.id == id })
    }

    func template(id: String) -> Template? {
        templates.first(where: { $0.id == id })
    }

    // MARK: 新建 / 进行中的考试

    @discardableResult
    func startExam(_ setup: ExamSetup) -> ExamSession {
        let now = TimeMath.nowMs()
        let start = TimeMath.normalized(setup.startVirtual)
        let end = TimeMath.normalized(setup.endVirtual)
        let duration = TimeMath.virtualDurationMs(start: start, end: end)

        let seeds = setup.modules.isEmpty
            ? [TemplateModule(id: "", name: "模块一", maxScore: nil)]
            : setup.modules

        var modules: [SessionModule] = []
        for (index, seed) in seeds.enumerated() {
            modules.append(
                SessionModule(
                    id: IDGen.make("sm"),
                    name: seed.name,
                    maxScore: seed.maxScore,
                    score: nil,
                    startedAt: index == 0 ? now : nil,
                    endedAt: nil,
                    elapsedMs: 0,
                    skipped: false
                )
            )
        }

        let plan = ExamPlan(
            startVirtual: start,
            endVirtual: end,
            durationMs: duration,
            totalScore: setup.totalScore
        )

        let session = ExamSession(
            id: IDGen.make("ses"),
            name: setup.name.trimmingCharacters(in: .whitespacesAndNewlines),
            templateId: setup.templateId,
            templateName: setup.templateName,
            plan: plan,
            modules: modules,
            status: .running,
            startedAt: now,
            finishedAt: nil,
            finishReason: nil,
            totalScore: nil,
            note: "",
            scoresFilled: false
        )

        sessions.append(session)
        settings.lastSetup = LastSetup(
            startVirtual: start,
            endVirtual: end,
            moduleCount: min(8, max(2, setup.moduleCount)),
            templateId: setup.templateId,
            totalScore: setup.totalScore
        )
        persist()
        return session
    }

    /// 完成当前模块；返回是否所有模块都已完成
    @discardableResult
    func completeCurrentModule(sessionId: String) -> Bool {
        guard let index = sessions.firstIndex(where: { $0.id == sessionId }),
              sessions[index].status == .running else {
            return false
        }
        let now = TimeMath.nowMs()

        guard let moduleIndex = sessions[index].modules.firstIndex(where: { $0.endedAt == nil }) else {
            return sessions[index].modules.allSatisfy { $0.endedAt != nil }
        }

        let started = sessions[index].modules[moduleIndex].startedAt ?? now
        sessions[index].modules[moduleIndex].endedAt = now
        sessions[index].modules[moduleIndex].elapsedMs = TimeMath.elapsedMs(from: started, to: now)

        if moduleIndex + 1 < sessions[index].modules.count {
            // 下一个模块从当前时刻继续计时
            sessions[index].modules[moduleIndex + 1].startedAt = now
        }

        let allDone = sessions[index].modules.allSatisfy { $0.endedAt != nil }
        persist()
        return allDone
    }

    /// 撤销上一个完成的模块：回到该模块，计时清零重新开始
    @discardableResult
    func undoLastModule(sessionId: String) -> Bool {
        guard let index = sessions.firstIndex(where: { $0.id == sessionId }),
              sessions[index].status == .running else {
            return false
        }
        guard let last = sessions[index].modules.lastIndex(where: { $0.endedAt != nil }) else {
            return false
        }

        let now = TimeMath.nowMs()
        sessions[index].modules[last].endedAt = nil
        sessions[index].modules[last].elapsedMs = 0
        sessions[index].modules[last].startedAt = now

        if last + 1 < sessions[index].modules.count {
            for later in (last + 1)..<sessions[index].modules.count {
                sessions[index].modules[later].startedAt = nil
                sessions[index].modules[later].endedAt = nil
                sessions[index].modules[later].elapsedMs = 0
            }
        }

        persist()
        return true
    }

    /// 交卷：把当前进行中的模块也计入用时；未开始的模块保持 0
    func finishSession(id: String, reason: FinishReason) {
        guard let index = sessions.firstIndex(where: { $0.id == id }),
              sessions[index].status == .running else {
            return
        }

        let now = TimeMath.nowMs()
        var effectiveNow = now
        if reason == .timeup, let started = sessions[index].startedAt {
            let planEnd = started + sessions[index].plan.durationMs
            if now > planEnd {
                effectiveNow = planEnd
            }
        }

        if let current = sessions[index].modules.firstIndex(where: { $0.startedAt != nil && $0.endedAt == nil }) {
            let started = sessions[index].modules[current].startedAt
            sessions[index].modules[current].endedAt = effectiveNow
            sessions[index].modules[current].elapsedMs = TimeMath.elapsedMs(from: started, to: effectiveNow)
        }

        sessions[index].status = .finished
        sessions[index].finishedAt = effectiveNow
        sessions[index].finishReason = reason
        persist()
    }

    /// 放弃本场：标记为 discarded，不进入考试记录
    func discardSession(id: String) {
        guard let index = sessions.firstIndex(where: { $0.id == id }),
              sessions[index].status == .running else {
            return
        }
        sessions[index].status = .discarded
        sessions[index].finishedAt = TimeMath.nowMs()
        sessions[index].finishReason = nil
        persist()
    }

    // MARK: 得分后补

    func updateScores(sessionId: String, update: SessionScoreUpdate) {
        guard let index = sessions.firstIndex(where: { $0.id == sessionId }) else {
            return
        }

        for moduleIndex in sessions[index].modules.indices {
            let moduleId = sessions[index].modules[moduleIndex].id
            sessions[index].modules[moduleIndex].score = update.moduleScores[moduleId]
        }
        // 只填了各模块得分、没填总分时，用模块合计作为总得分
        let moduleValues = sessions[index].modules.compactMap { $0.score }
        let derivedTotal: Int? = moduleValues.isEmpty ? nil : moduleValues.reduce(0, +)
        sessions[index].totalScore = update.totalScore ?? derivedTotal
        sessions[index].note = update.note.trimmingCharacters(in: .whitespacesAndNewlines)
        sessions[index].scoresFilled = sessions[index].totalScore != nil
            || sessions[index].modules.contains(where: { $0.score != nil })
        persist()
    }

    func deleteSession(id: String) {
        sessions.removeAll { $0.id == id }
        persist()
    }

    // MARK: 模版

    /// 保存模版（id 为 nil 表示新建）；返回模版 id，失败返回 nil
    @discardableResult
    func saveTemplate(id: String?, name: String, modules: [TemplateModule]) -> String? {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, !modules.isEmpty else { return nil }

        var normalized: [TemplateModule] = []
        for module in modules {
            let moduleName = module.name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !moduleName.isEmpty else { return nil }
            let moduleId = module.id.isEmpty ? IDGen.make("tmod") : module.id
            normalized.append(TemplateModule(id: moduleId, name: moduleName, maxScore: module.maxScore))
        }

        let now = TimeMath.nowMs()
        if let id = id, let index = templates.firstIndex(where: { $0.id == id }) {
            templates[index].name = trimmedName
            templates[index].modules = normalized
            templates[index].updatedAt = now
            persist()
            return id
        }

        let template = Template(
            id: IDGen.make("tpl"),
            name: trimmedName,
            modules: normalized,
            createdAt: now,
            updatedAt: now
        )
        templates.append(template)
        persist()
        return template.id
    }

    func deleteTemplate(id: String) {
        templates.removeAll { $0.id == id }
        persist()
    }

    // MARK: 设置

    func setClockMode(_ mode: ClockMode) {
        guard settings.clockMode != mode else { return }
        settings.clockMode = mode
        persist()
    }

    func setSoundEnabled(_ enabled: Bool) {
        guard settings.sound != enabled else { return }
        settings.sound = enabled
        persist()
    }

    func setKeepAwake(_ enabled: Bool) {
        guard settings.keepAwake != enabled else { return }
        settings.keepAwake = enabled
        persist()
    }

    /// 生成一份可分享的 JSON 备份，返回临时文件 URL
    func makeExportFile() -> URL? {
        let document = AppData(version: 1, settings: settings, templates: templates, sessions: sessions)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted]
        guard let data = try? encoder.encode(document) else { return nil }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("mockexam.json")
        do {
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }

    // MARK: 持久化

    private func persist() {
        let document = AppData(version: 1, settings: settings, templates: templates, sessions: sessions)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted]
        do {
            let directory = fileURL.deletingLastPathComponent()
            if !FileManager.default.fileExists(atPath: directory.path) {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            }
            let data = try encoder.encode(document)
            try data.write(to: fileURL, options: [.atomic])
        } catch {
            loadWarning = "保存失败：\(error.localizedDescription)"
        }
    }

    // MARK: 默认数据 / 自愈

    static func defaultFileURL() -> URL {
        let manager = FileManager.default
        let base = manager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? manager.temporaryDirectory
        return base.appendingPathComponent("mockexam.json")
    }

    static func makeDefaultSettings() -> AppSettings {
        AppSettings(
            clockMode: .digital,
            sound: true,
            keepAwake: true,
            lastSetup: LastSetup(
                startVirtual: 32_400_000,
                endVirtual: 39_600_000,
                moduleCount: 4,
                templateId: nil,
                totalScore: nil
            )
        )
    }

    static func makeDefaultTemplates() -> [Template] {
        let now = TimeMath.nowMs()
        let modules = [
            TemplateModule(id: IDGen.make("tmod"), name: "常识判断", maxScore: nil),
            TemplateModule(id: IDGen.make("tmod"), name: "判断推理", maxScore: 30),
            TemplateModule(id: IDGen.make("tmod"), name: "资料分析", maxScore: 30),
            TemplateModule(id: IDGen.make("tmod"), name: "言语理解", maxScore: 20),
            TemplateModule(id: IDGen.make("tmod"), name: "数量关系", maxScore: 20)
        ]
        return [
            Template(
                id: IDGen.make("tpl"),
                name: "行测（示例）",
                modules: modules,
                createdAt: now,
                updatedAt: now
            )
        ]
    }

    private func repairLoadedData() {
        if settings.lastSetup.moduleCount < 2 || settings.lastSetup.moduleCount > 8 {
            settings.lastSetup.moduleCount = 4
        }
        settings.lastSetup.startVirtual = TimeMath.normalized(settings.lastSetup.startVirtual)
        settings.lastSetup.endVirtual = TimeMath.normalized(settings.lastSetup.endVirtual)

        for index in sessions.indices {
            let expected = TimeMath.virtualDurationMs(
                start: sessions[index].plan.startVirtual,
                end: sessions[index].plan.endVirtual
            )
            if sessions[index].plan.durationMs <= 0 {
                sessions[index].plan.durationMs = expected
            }
            sessions[index].scoresFilled = sessions[index].totalScore != nil
                || sessions[index].modules.contains(where: { $0.score != nil })
        }
    }

    /// 冷启动时，若 running 的考试已经超过计划结束时间，直接按计划结束时刻收卷
    private static func autoFinishOverdue(_ input: [ExamSession], now: Int) -> [ExamSession] {
        var result = input
        for index in result.indices {
            guard result[index].status == .running, let started = result[index].startedAt else { continue }
            let planEnd = started + result[index].plan.durationMs
            guard now >= planEnd else { continue }

            if let current = result[index].modules.firstIndex(where: { $0.startedAt != nil && $0.endedAt == nil }) {
                let moduleStart = result[index].modules[current].startedAt
                result[index].modules[current].endedAt = planEnd
                result[index].modules[current].elapsedMs = TimeMath.elapsedMs(from: moduleStart, to: planEnd)
            }

            result[index].status = .finished
            result[index].finishedAt = planEnd
            result[index].finishReason = .timeup
        }
        return result
    }
}
