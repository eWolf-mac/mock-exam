//
//  Models.swift
//  MockExamClock
//
//  数据模型、虚拟时间换算与结果分析算法。
//  字段命名严格对齐 docs/SPEC.md 第 2 节（全部 camelCase，不做 key 转换）。
//

import Foundation

/// 让 nil 也写出 JSON 的 null（默认的 Codable 合成会省略 nil 字段）。
/// SPEC 第 2 节要求字段齐全，Web 端也使用显式 null。
private func encodeOrNull<K: CodingKey, T: Encodable>(
    _ value: T?,
    forKey key: K,
    into container: inout KeyedEncodingContainer<K>
) throws {
    if let value = value {
        try container.encode(value, forKey: key)
    } else {
        try container.encodeNil(forKey: key)
    }
}

// MARK: - 基础数据模型

/// 时钟显示模式：数字 / 表盘
enum ClockMode: String, Codable, CaseIterable, Identifiable, Hashable {
    case digital
    case analog

    var id: String { rawValue }
}

/// 新建考试时记住的「上次设置」
struct LastSetup: Codable, Equatable {
    var startVirtual: Int
    var endVirtual: Int
    var moduleCount: Int
    var templateId: String?
    var totalScore: Int?

    private enum CodingKeys: String, CodingKey {
        case startVirtual
        case endVirtual
        case moduleCount
        case templateId
        case totalScore
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(startVirtual, forKey: .startVirtual)
        try container.encode(endVirtual, forKey: .endVirtual)
        try container.encode(moduleCount, forKey: .moduleCount)
        try encodeOrNull(templateId, forKey: .templateId, into: &container)
        try encodeOrNull(totalScore, forKey: .totalScore, into: &container)
    }
}

/// 应用设置
struct AppSettings: Codable, Equatable {
    var clockMode: ClockMode
    var sound: Bool
    var keepAwake: Bool
    var lastSetup: LastSetup
}

/// 模版中的模块
struct TemplateModule: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var maxScore: Int?

    private enum CodingKeys: String, CodingKey {
        case id
        case name
        case maxScore
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try encodeOrNull(maxScore, forKey: .maxScore, into: &container)
    }
}

/// 模块模版
struct Template: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var modules: [TemplateModule]
    var createdAt: Int
    var updatedAt: Int
}

/// 考试计划：一天内的毫秒偏移
struct ExamPlan: Codable, Equatable {
    var startVirtual: Int
    var endVirtual: Int
    var durationMs: Int
    var totalScore: Int?

    private enum CodingKeys: String, CodingKey {
        case startVirtual
        case endVirtual
        case durationMs
        case totalScore
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(startVirtual, forKey: .startVirtual)
        try container.encode(endVirtual, forKey: .endVirtual)
        try container.encode(durationMs, forKey: .durationMs)
        try encodeOrNull(totalScore, forKey: .totalScore, into: &container)
    }
}

/// 一场考试中的模块记录
struct SessionModule: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var maxScore: Int?
    var score: Int?
    /// 真实时间戳（毫秒）。未开始的模块为 nil
    var startedAt: Int?
    var endedAt: Int?
    var elapsedMs: Int
    /// 保留字段，当前恒为 false
    var skipped: Bool

    private enum CodingKeys: String, CodingKey {
        case id
        case name
        case maxScore
        case score
        case startedAt
        case endedAt
        case elapsedMs
        case skipped
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try encodeOrNull(maxScore, forKey: .maxScore, into: &container)
        try encodeOrNull(score, forKey: .score, into: &container)
        try encodeOrNull(startedAt, forKey: .startedAt, into: &container)
        try encodeOrNull(endedAt, forKey: .endedAt, into: &container)
        try container.encode(elapsedMs, forKey: .elapsedMs)
        try container.encode(skipped, forKey: .skipped)
    }
}

/// 考试状态
enum SessionStatus: String, Codable, Equatable {
    case running
    case finished
    case discarded
}

/// 收卷原因
enum FinishReason: String, Codable, Equatable {
    case manual
    case timeup
}

/// 一场模拟考试
struct ExamSession: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var templateId: String?
    /// 模版名快照：模版之后被改 / 删都不影响历史
    var templateName: String
    var plan: ExamPlan
    var modules: [SessionModule]
    var status: SessionStatus
    var startedAt: Int?
    var finishedAt: Int?
    var finishReason: FinishReason?
    var totalScore: Int?
    var note: String
    var scoresFilled: Bool

    private enum CodingKeys: String, CodingKey {
        case id
        case name
        case templateId
        case templateName
        case plan
        case modules
        case status
        case startedAt
        case finishedAt
        case finishReason
        case totalScore
        case note
        case scoresFilled
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try encodeOrNull(templateId, forKey: .templateId, into: &container)
        try container.encode(templateName, forKey: .templateName)
        try container.encode(plan, forKey: .plan)
        try container.encode(modules, forKey: .modules)
        try container.encode(status, forKey: .status)
        try encodeOrNull(startedAt, forKey: .startedAt, into: &container)
        try encodeOrNull(finishedAt, forKey: .finishedAt, into: &container)
        try encodeOrNull(finishReason, forKey: .finishReason, into: &container)
        try encodeOrNull(totalScore, forKey: .totalScore, into: &container)
        try container.encode(note, forKey: .note)
        try container.encode(scoresFilled, forKey: .scoresFilled)
    }
}

/// 持久化 JSON 的根结构
struct AppData: Codable {
    var version: Int
    var settings: AppSettings
    var templates: [Template]
    var sessions: [ExamSession]
}

/// 新建考试时传给 Store 的配置
struct ExamSetup {
    var name: String
    var startVirtual: Int
    var endVirtual: Int
    var templateId: String?
    var templateName: String
    /// 只取 name / maxScore，Store 会重新生成 session 内的模块 id
    var modules: [TemplateModule]
    var totalScore: Int?
    /// 默认模块个数（2…8），写入 lastSetup
    var moduleCount: Int
}

/// 结果页保存得分时的载荷
struct SessionScoreUpdate {
    var totalScore: Int?
    /// 只包含已填写的模块；未出现在字典里的模块得分会被清空
    var moduleScores: [String: Int]
    var note: String
}

// MARK: - 便捷读取

extension ExamSession {
    /// 名称为空时显示「模拟考试」
    var displayName: String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "模拟考试" : trimmed
    }

    /// 已完成模块的用时之和
    var totalModuleElapsedMs: Int {
        modules.reduce(0) { $0 + max(0, $1.elapsedMs) }
    }

    var completedModuleCount: Int {
        modules.filter { $0.endedAt != nil || $0.elapsedMs > 0 }.count
    }

    /// 开始到收卷的真实耗时
    var examElapsedMs: Int {
        guard let finished = finishedAt else { return 0 }
        return TimeMath.elapsedMs(from: startedAt, to: finished)
    }
}

/// 默认模块名称（固定 8 个，取前 n 个）
enum DefaultModuleNames {
    static let list = ["模块一", "模块二", "模块三", "模块四", "模块五", "模块六", "模块七", "模块八"]

    static func name(at index: Int) -> String {
        if index >= 0 && index < list.count {
            return list[index]
        }
        return "模块\(index + 1)"
    }
}

// MARK: - 时间换算（全工程唯一实现）

/// 所有「虚拟时间 / 真实时间 / 日期字符串」的换算都集中在这里。
/// 虚拟时间是「一天内的毫秒偏移」，范围 0 … 86,399,999。
enum TimeMath {
    static let dayMs = 86_400_000

    static func nowMs() -> Int {
        Int((Date().timeIntervalSince1970 * 1000).rounded())
    }

    /// 把毫秒偏移归一化到 [0, 24h)
    static func normalized(_ ms: Int) -> Int {
        let value = ms % dayMs
        return value < 0 ? value + dayMs : value
    }

    /// 计划时长。结束 <= 开始视为跨零点，加 24h；结束 == 开始时为 24h。
    static func virtualDurationMs(start: Int, end: Int) -> Int {
        let s = normalized(start)
        let e = normalized(end)
        if e <= s {
            return e - s + dayMs
        }
        return e - s
    }

    static func components(of ms: Int) -> (hour: Int, minute: Int, second: Int) {
        let value = normalized(ms)
        let seconds = value / 1000
        return (seconds / 3600, (seconds % 3600) / 60, seconds % 60)
    }

    /// HH:MM:SS
    static func clockText(_ ms: Int) -> String {
        let parts = components(of: ms)
        return String(format: "%02d:%02d:%02d", parts.hour, parts.minute, parts.second)
    }

    /// HH:MM
    static func shortClockText(_ ms: Int) -> String {
        let parts = components(of: ms)
        return String(format: "%02d:%02d", parts.hour, parts.minute)
    }

    /// 倒计时 HH:MM:SS（小时也补零）
    static func countdownText(_ ms: Int) -> String {
        let total = max(0, ms) / 1000
        return String(format: "%02d:%02d:%02d", total / 3600, (total % 3600) / 60, total % 60)
    }

    /// 时长文本：有小时为 H:MM:SS，否则 MM:SS
    static func durationText(_ ms: Int) -> String {
        let total = max(0, ms) / 1000
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%02d:%02d", minutes, seconds)
    }

    /// 「120 分钟」（四舍五入到整分钟）
    static func minutesText(_ ms: Int) -> String {
        let minutes = max(0, Int((Double(ms) / 60_000.0).rounded()))
        return "\(minutes) 分钟"
    }

    static func percentText(_ ratio: Double) -> String {
        let safe = ratio.isFinite ? ratio : 0
        return "\(Int((safe * 100).rounded()))%"
    }

    /// 计划分钟数（用于「共 120 分钟」）
    static func planMinutes(start: Int, end: Int) -> Int {
        virtualDurationMs(start: start, end: end) / 60_000
    }

    /// 把虚拟毫秒偏移转成「今天」的一个 Date（仅用于 DatePicker 预填）
    static func dateForVirtual(_ ms: Int, base: Date = Date()) -> Date {
        let parts = components(of: ms)
        var comps = Calendar.current.dateComponents([.year, .month, .day], from: base)
        comps.hour = parts.hour
        comps.minute = parts.minute
        comps.second = 0
        return Calendar.current.date(from: comps) ?? base
    }

    /// 从 DatePicker 取「一天内毫秒偏移」（忽略日期部分）
    static func virtualMs(from date: Date) -> Int {
        let comps = Calendar.current.dateComponents([.hour, .minute], from: date)
        let hour = comps.hour ?? 0
        let minute = comps.minute ?? 0
        return normalized((hour * 3600 + minute * 60) * 1000)
    }

    /// 本地真实时间 HH:MM
    static func localTimeText(_ date: Date = Date()) -> String {
        let comps = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", comps.hour ?? 0, comps.minute ?? 0)
    }

    /// 日期时间文本（记录列表 / 结果页）
    static func dateTimeText(_ ms: Int?) -> String {
        guard let ms = ms, ms > 0 else { return "—" }
        let date = Date(timeIntervalSince1970: Double(ms) / 1000.0)
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    // MARK: 考试进行中的换算

    /// 两个真实时间戳之间的耗时（毫秒），自动处理 nil 与负数
    static func elapsedMs(from start: Int?, to end: Int) -> Int {
        guard let start = start else { return 0 }
        return max(0, end - start)
    }

    /// 考场时钟 = 计划开始 + (真实现在 - 实际开始)，必须用时间戳差值，不能累加定时器
    static func virtualNow(session: ExamSession, realNowMs: Int) -> Int {
        let base = session.startedAt ?? realNowMs
        return session.plan.startVirtual + max(0, realNowMs - base)
    }

    static func sessionElapsedMs(session: ExamSession, realNowMs: Int) -> Int {
        return elapsedMs(from: session.startedAt, to: realNowMs)
    }

    static func sessionRemainingMs(session: ExamSession, realNowMs: Int) -> Int {
        return max(0, session.plan.durationMs - sessionElapsedMs(session: session, realNowMs: realNowMs))
    }

    /// 模块实时用时：已结束用 elapsedMs，进行中用「现在 - startedAt」
    static func moduleElapsedMs(_ module: SessionModule, realNowMs: Int) -> Int {
        if module.endedAt != nil {
            return max(0, module.elapsedMs)
        }
        return elapsedMs(from: module.startedAt, to: realNowMs)
    }
}
