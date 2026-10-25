//
//  NewExamView.swift
//  MockExamClock
//
//  新建考试（Sheet）。时间只取 00:00–23:59，结束 <= 开始按跨零点处理。
//

import SwiftUI
import Foundation

private enum ModuleSource: String, CaseIterable, Identifiable, Hashable {
    case defaultModules
    case template

    var id: String { rawValue }

    var title: String {
        self == .defaultModules ? "默认模块" : "自定义模版"
    }
}

struct NewExamView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.colorScheme) private var scheme

    var onStarted: (String) -> Void

    @State private var name: String = ""
    @State private var startDate: Date = Date()
    @State private var endDate: Date = Date()
    @State private var source: ModuleSource = .defaultModules
    @State private var moduleCount: Int = 4
    @State private var selectedTemplateId: String? = nil
    @State private var totalScoreText: String = ""
    @State private var didApplyDefaults = false
    @State private var showTemplateEditor = false

    private var c: ThemeColors { Theme.colors(for: scheme) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    nameSection
                    timeSection
                    moduleSection
                    scoreSection
                    tipSection
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 16)
            }
            .background(c.background.ignoresSafeArea())
            .navigationTitle("新建考试")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismissSheet() }
                        .foregroundStyle(c.subtext)
                }
            }
            .safeAreaInset(edge: .bottom) {
                bottomBar
            }
            .onAppear(perform: applyDefaults)
            .sheet(isPresented: $showTemplateEditor) {
                TemplateEditorView(template: nil, onSaved: { newId in
                    selectedTemplateId = newId
                    source = .template
                })
                .environmentObject(store)
            }
        }
    }

    @Environment(\.dismiss) private var dismiss

    private func dismissSheet() {
        dismiss()
    }

    // MARK: 表单区块

    private var nameSection: some View {
        sectionBox("考试名称") {
            TextField("例：2026 国考行测 第 3 套", text: $name)
                .examField(c)
        }
    }

    private var timeSection: some View {
        sectionBox("考试时间") {
            timeRow("开始", selection: $startDate)
            Divider().overlay(c.stroke)
            timeRow("结束", selection: $endDate)

            HStack(spacing: 8) {
                Text("共 \(durationMs / 60_000) 分钟")
                    .font(Theme.mono(15, weight: .semibold))
                    .foregroundStyle(c.accent)
                if isSameTime {
                    StatusTag(text: "24 小时", color: c.warning)
                } else if isOvernight {
                    StatusTag(text: "跨零点", color: c.warning)
                }
                Spacer()
            }

            Text("结束时间早于开始时间时自动按跨零点计算；两者相同按 24 小时计算。")
                .font(.system(size: 11))
                .foregroundStyle(c.subtext)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var moduleSection: some View {
        sectionBox("模块模版") {
            Picker("模块来源", selection: $source) {
                ForEach(ModuleSource.allCases) { item in
                    Text(item.title).tag(item)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            if source == .defaultModules {
                Stepper(value: $moduleCount, in: 2...8) {
                    HStack(spacing: 8) {
                        Text("默认模块 \(moduleCount) 个")
                            .font(.system(size: 15))
                            .foregroundStyle(c.text)
                        Spacer()
                        Text(defaultNamesPreview)
                            .font(.system(size: 11))
                            .foregroundStyle(c.subtext)
                            .lineLimit(1)
                    }
                }
                .tint(c.accent)

                Text("默认模块按「模块一」…「模块八」命名，满分留空。")
                    .font(.system(size: 11))
                    .foregroundStyle(c.subtext)
            } else {
                if store.templates.isEmpty {
                    Text("还没有自定义模版，先新建一个吧。")
                        .font(.system(size: 13))
                        .foregroundStyle(c.subtext)
                } else {
                    Picker("选择模版", selection: $selectedTemplateId) {
                        Text("请选择模版").tag(Optional<String>.none)
                        ForEach(store.templates) { template in
                            Text(template.name).tag(Optional(template.id))
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(c.accent)
                }

                Button {
                    showTemplateEditor = true
                } label: {
                    Label("新建模版", systemImage: "plus.circle")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(c.accent)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var scoreSection: some View {
        sectionBox("考试总分") {
            TextField("选填，如 100", text: $totalScoreText)
                .keyboardType(.numberPad)
                .examField(c)
            Text("总分只用于计算得分率，可交卷后再补录。")
                .font(.system(size: 11))
                .foregroundStyle(c.subtext)
        }
    }

    private var tipSection: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "info.circle")
                .foregroundStyle(c.accent)
            Text("考试中按「完成本模块」记录每段用时；结束后可补录各模块得分。")
                .font(.system(size: 12))
                .foregroundStyle(c.subtext)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 4)
    }

    // MARK: 底部按钮

    private var bottomBar: some View {
        VStack(spacing: 8) {
            if let error = validationError {
                Text(error)
                    .font(.system(size: 12))
                    .foregroundStyle(c.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Button {
                start()
            } label: {
                Text("开始考试")
            }
            .buttonStyle(PrimaryButtonStyle(colors: c))
            .disabled(validationError != nil)
            .opacity(validationError == nil ? 1.0 : 0.45)
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(c.background)
    }

    // MARK: 计算

    private var startVirtual: Int { TimeMath.virtualMs(from: startDate) }
    private var endVirtual: Int { TimeMath.virtualMs(from: endDate) }
    private var durationMs: Int { TimeMath.virtualDurationMs(start: startVirtual, end: endVirtual) }
    private var isOvernight: Bool { endVirtual < startVirtual }
    private var isSameTime: Bool { endVirtual == startVirtual }

    private var selectedTemplate: Template? {
        guard let id = selectedTemplateId else { return nil }
        return store.template(id: id)
    }

    private var defaultNamesPreview: String {
        let names = (0..<moduleCount).map { DefaultModuleNames.name(at: $0) }
        return names.joined(separator: "、")
    }

    private var parsedTotalScore: Int? {
        let trimmed = totalScoreText.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }
        return Int(trimmed)
    }

    private var validationError: String? {
        if source == .template && selectedTemplate == nil {
            return "请选择一个模版，或新建模版。"
        }
        let trimmed = totalScoreText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            if let value = Int(trimmed) {
                if value < 0 {
                    return "总分需为非负整数，或留空。"
                }
            } else {
                return "总分需为非负整数，或留空。"
            }
        }
        if durationMs <= 0 {
            return "考试时长必须大于 0。"
        }
        return nil
    }

    // MARK: 动作

    private func applyDefaults() {
        guard !didApplyDefaults else { return }
        didApplyDefaults = true

        let setup = store.settings.lastSetup
        startDate = TimeMath.dateForVirtual(setup.startVirtual)
        endDate = TimeMath.dateForVirtual(setup.endVirtual)
        moduleCount = min(8, max(2, setup.moduleCount))
        if let total = setup.totalScore {
            totalScoreText = String(total)
        }
        if let templateId = setup.templateId, store.template(id: templateId) != nil {
            selectedTemplateId = templateId
            source = .template
        }
    }

    private func start() {
        guard validationError == nil else { return }

        let seeds: [TemplateModule]
        let templateName: String
        let templateId: String?

        if source == .template, let template = selectedTemplate {
            seeds = template.modules
            templateName = template.name
            templateId = template.id
        } else {
            seeds = (0..<moduleCount).map { index in
                TemplateModule(id: "", name: DefaultModuleNames.name(at: index), maxScore: nil)
            }
            templateName = "默认模块（\(moduleCount) 个）"
            templateId = nil
        }

        let setup = ExamSetup(
            name: name,
            startVirtual: startVirtual,
            endVirtual: endVirtual,
            templateId: templateId,
            templateName: templateName,
            modules: seeds,
            totalScore: parsedTotalScore,
            moduleCount: moduleCount
        )

        let session = store.startExam(setup)
        onStarted(session.id)
    }

    // MARK: 小工具

    @ViewBuilder
    private func sectionBox<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(c.subtext)
            content()
        }
        .themeCard(c)
    }

    private func timeRow(_ title: String, selection: Binding<Date>) -> some View {
        HStack {
            Text(title)
                .font(.system(size: 15))
                .foregroundStyle(c.subtext)
            Spacer()
            DatePicker("", selection: selection, displayedComponents: .hourAndMinute)
                .labelsHidden()
                .datePickerStyle(.compact)
                .tint(c.accent)
                .environment(\.locale, Locale(identifier: "zh_CN"))
        }
    }
}
