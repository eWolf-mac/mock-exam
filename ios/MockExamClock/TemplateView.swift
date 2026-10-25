//
//  TemplateView.swift
//  MockExamClock
//
//  模块模版列表与编辑页。
//

import SwiftUI
import Foundation

// MARK: - 编辑用的草稿模块

private struct DraftModule: Identifiable {
    var id: String
    var name: String
    var maxScoreText: String
}

// MARK: - 列表

private enum TemplateRoute: Identifiable {
    case create
    case edit(Template)

    var id: String {
        switch self {
        case .create:
            return "create"
        case .edit(let template):
            return template.id
        }
    }
}

struct TemplateListView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.colorScheme) private var scheme

    @State private var route: TemplateRoute? = nil
    @State private var pendingDelete: Template? = nil

    private var c: ThemeColors { Theme.colors(for: scheme) }

    var body: some View {
        NavigationStack {
            ZStack {
                c.background.ignoresSafeArea()

                if store.templates.isEmpty {
                    emptyView
                } else {
                    listView
                }
            }
            .navigationTitle("模块模版")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        route = .create
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 16, weight: .semibold))
                    }
                    .accessibilityLabel(Text("新建模版"))
                }
            }
            .sheet(item: $route) { item in
                switch item {
                case .create:
                    TemplateEditorView(template: nil)
                case .edit(let template):
                    TemplateEditorView(template: template)
                }
            }
            .confirmationDialog(
                "删除模版",
                isPresented: Binding(
                    get: { pendingDelete != nil },
                    set: { if !$0 { pendingDelete = nil } }
                ),
                titleVisibility: .visible,
                presenting: pendingDelete
            ) { template in
                Button("删除「\(template.name)」", role: .destructive) {
                    store.deleteTemplate(id: template.id)
                    pendingDelete = nil
                }
                Button("取消", role: .cancel) {
                    pendingDelete = nil
                }
            } message: { _ in
                Text("删除后不影响已完成的考试记录（历史记录使用模版快照）。")
            }
        }
    }

    private var listView: some View {
        List {
            Section {
                ForEach(store.templates) { template in
                    Button {
                        route = .edit(template)
                    } label: {
                        row(template)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(c.panel)
                    .contextMenu {
                        Button {
                            route = .edit(template)
                        } label: {
                            Label("编辑", systemImage: "pencil")
                        }
                        Button(role: .destructive) {
                            pendingDelete = template
                        } label: {
                            Label("删除", systemImage: "trash")
                        }
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            pendingDelete = template
                        } label: {
                            Label("删除", systemImage: "trash")
                        }
                        Button {
                            route = .edit(template)
                        } label: {
                            Label("编辑", systemImage: "pencil")
                        }
                        .tint(c.accent)
                    }
                }
            } footer: {
                Text("点击编辑，左滑删除。")
            }
        }
        .scrollContentBackground(.hidden)
        .listStyle(.insetGrouped)
    }

    private func row(_ template: Template) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(template.name)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(c.text)
                Text(modulePreview(template))
                    .font(.system(size: 12))
                    .foregroundStyle(c.subtext)
                    .lineLimit(1)
                Text("\(template.modules.count) 个模块")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(c.accent)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(c.subtext)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    private func modulePreview(_ template: Template) -> String {
        let names = template.modules.map { $0.name }
        if names.isEmpty { return "（无模块）" }
        return names.joined(separator: " · ")
    }

    private var emptyView: some View {
        VStack(spacing: 12) {
            Image(systemName: "square.stack.3d.up")
                .font(.system(size: 42, weight: .light))
                .foregroundStyle(c.accent)
            Text("还没有自定义模版")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(c.text)
            Text("把常用的模块组合保存成模版，下次一键复用。")
                .font(.system(size: 13))
                .foregroundStyle(c.subtext)
                .multilineTextAlignment(.center)
            Button {
                route = .create
            } label: {
                Label("新建模版", systemImage: "plus")
            }
            .buttonStyle(PrimaryButtonStyle(colors: c, fullWidth: false))
            .padding(.top, 6)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - 编辑页

struct TemplateEditorView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss

    let template: Template?
    var onSaved: ((String) -> Void)?

    @State private var name: String
    @State private var modules: [DraftModule]
    @State private var errorText: String? = nil

    private var c: ThemeColors { Theme.colors(for: scheme) }

    init(template: Template?, onSaved: ((String) -> Void)? = nil) {
        self.template = template
        self.onSaved = onSaved

        _name = State(initialValue: template?.name ?? "")

        if let template = template, !template.modules.isEmpty {
            let drafts = template.modules.map { module in
                DraftModule(
                    id: module.id,
                    name: module.name,
                    maxScoreText: module.maxScore.map { String($0) } ?? ""
                )
            }
            _modules = State(initialValue: drafts)
        } else {
            _modules = State(initialValue: [
                DraftModule(id: IDGen.make("tmod"), name: "模块一", maxScoreText: "")
            ])
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section("模版名称") {
                    TextField("例：行测（示例）", text: $name)
                        .font(.system(size: 16))
                        .foregroundStyle(c.text)
                }

                Section {
                    ForEach(modules) { module in
                        TemplateModuleRow(
                            index: moduleIndex(module.id),
                            module: moduleBinding(module.id),
                            canMoveUp: moduleIndex(module.id) > 0,
                            canMoveDown: moduleIndex(module.id) < modules.count - 1,
                            canDelete: modules.count > 1,
                            colors: c,
                            onMoveUp: { move(id: module.id, offset: -1) },
                            onMoveDown: { move(id: module.id, offset: 1) },
                            onDelete: { delete(id: module.id) }
                        )
                    }

                    Button {
                        addModule()
                    } label: {
                        Label("添加模块", systemImage: "plus.circle.fill")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(c.accent)
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                } header: {
                    Text("模块（\(modules.count)）")
                } footer: {
                    Text("至少 1 个模块；满分可留空。")
                }

                if let errorText = errorText {
                    Section {
                        Text(errorText)
                            .font(.system(size: 13))
                            .foregroundStyle(c.danger)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(c.background.ignoresSafeArea())
            .tint(c.accent)
            .navigationTitle(template == nil ? "新建模版" : "编辑模版")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") { save() }
                }
            }
        }
    }

    // MARK: 模块操作

    private func moduleIndex(_ id: String) -> Int {
        modules.firstIndex(where: { $0.id == id }) ?? 0
    }

    private func moduleBinding(_ id: String) -> Binding<DraftModule> {
        Binding(
            get: {
                modules.first(where: { $0.id == id })
                    ?? DraftModule(id: id, name: "", maxScoreText: "")
            },
            set: { newValue in
                if let index = modules.firstIndex(where: { $0.id == id }) {
                    modules[index] = newValue
                }
            }
        )
    }

    private func addModule() {
        let index = modules.count
        let draft = DraftModule(
            id: IDGen.make("tmod"),
            name: DefaultModuleNames.name(at: index),
            maxScoreText: ""
        )
        withAnimation {
            modules.append(draft)
        }
    }

    private func move(id: String, offset: Int) {
        guard let index = modules.firstIndex(where: { $0.id == id }) else { return }
        let target = index + offset
        guard target >= 0, target < modules.count else { return }
        withAnimation {
            let item = modules.remove(at: index)
            modules.insert(item, at: target)
        }
    }

    private func delete(id: String) {
        guard modules.count > 1 else { return }
        withAnimation {
            modules.removeAll { $0.id == id }
        }
    }

    // MARK: 保存

    private func save() {
        errorText = nil

        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            errorText = "模版名称不能为空。"
            return
        }
        guard !modules.isEmpty else {
            errorText = "至少需要 1 个模块。"
            return
        }

        var parsed: [TemplateModule] = []
        for (index, draft) in modules.enumerated() {
            let moduleName = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !moduleName.isEmpty else {
                errorText = "第 \(index + 1) 个模块名称不能为空。"
                return
            }

            var maxScore: Int? = nil
            let maxText = draft.maxScoreText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !maxText.isEmpty {
                guard let value = Int(maxText), value >= 0 else {
                    errorText = "第 \(index + 1) 个模块满分需为非负整数。"
                    return
                }
                maxScore = value
            }

            parsed.append(TemplateModule(id: draft.id, name: moduleName, maxScore: maxScore))
        }

        if let savedId = store.saveTemplate(id: template?.id, name: trimmedName, modules: parsed) {
            onSaved?(savedId)
            dismiss()
        } else {
            errorText = "保存失败，请检查模版名称与模块。"
        }
    }
}

// MARK: - 模块编辑行

private struct TemplateModuleRow: View {
    let index: Int
    @Binding var module: DraftModule
    let canMoveUp: Bool
    let canMoveDown: Bool
    let canDelete: Bool
    let colors: ThemeColors
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 8) {
                Text("\(index + 1)")
                    .font(Theme.mono(12, weight: .semibold))
                    .foregroundStyle(colors.subtext)
                    .frame(width: 20, alignment: .leading)

                TextField("模块名称", text: $module.name)
                    .font(.system(size: 15))
                    .foregroundStyle(colors.text)

                TextField("满分", text: $module.maxScoreText)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .font(.system(size: 13))
                    .foregroundStyle(colors.subtext)
                    .frame(width: 58)
            }

            HStack(spacing: 2) {
                Button(action: onMoveUp) {
                    Image(systemName: "arrow.up")
                        .frame(width: 44, height: 44)
                }
                .disabled(!canMoveUp)
                .accessibilityLabel(Text("上移"))

                Button(action: onMoveDown) {
                    Image(systemName: "arrow.down")
                        .frame(width: 44, height: 44)
                }
                .disabled(!canMoveDown)
                .accessibilityLabel(Text("下移"))

                Spacer()

                Button(role: .destructive, action: onDelete) {
                    Image(systemName: "trash")
                        .frame(width: 44, height: 44)
                }
                .disabled(!canDelete)
                .accessibilityLabel(Text("删除模块"))
            }
            .buttonStyle(.borderless)
            .font(.system(size: 15, weight: .medium))
        }
        .padding(.vertical, 2)
    }
}
