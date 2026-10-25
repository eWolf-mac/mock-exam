//
//  ScoreEditView.swift
//  MockExamClock
//
//  交卷后的得分补录：总分 + 各模块得分 + 备注。
//

import SwiftUI
import Foundation

// MARK: - 得分编辑

private struct ScoreDraft: Identifiable {
    let id: String
    let name: String
    let maxScore: Int?
    var text: String
}

struct ScoreEditView: View {
    let session: ExamSession
    var onSave: (SessionScoreUpdate) -> Void
    var onClose: () -> Void

    @Environment(\.colorScheme) private var scheme

    @State private var totalText: String
    @State private var drafts: [ScoreDraft]
    @State private var note: String
    @State private var errorText: String? = nil

    private var c: ThemeColors { Theme.colors(for: scheme) }

    init(session: ExamSession, onSave: @escaping (SessionScoreUpdate) -> Void, onClose: @escaping () -> Void) {
        self.session = session
        self.onSave = onSave
        self.onClose = onClose

        _totalText = State(initialValue: session.totalScore.map { String($0) } ?? "")
        _note = State(initialValue: session.note)
        _drafts = State(initialValue: session.modules.map { module in
            ScoreDraft(
                id: module.id,
                name: module.name,
                maxScore: module.maxScore,
                text: module.score.map { String($0) } ?? ""
            )
        })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("总分") {
                    HStack {
                        Text("总得分")
                        Spacer()
                        TextField("选填", text: $totalText)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 120)
                    }
                    if let maxScore = session.plan.totalScore {
                        Text("满分 \(maxScore)")
                            .font(.system(size: 12))
                            .foregroundStyle(c.subtext)
                    }
                }

                Section("模块得分") {
                    ForEach($drafts) { $draft in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text($draft.wrappedValue.name)
                                    .font(.system(size: 14))
                                if let maxScore = $draft.wrappedValue.maxScore {
                                    Text("满分 \(maxScore)")
                                        .font(.system(size: 11))
                                        .foregroundStyle(c.subtext)
                                }
                            }
                            Spacer()
                            TextField("—", text: $draft.text)
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                                .frame(maxWidth: 90)
                        }
                    }

                    if let mismatch = liveMismatch {
                        Text(mismatch)
                            .font(.system(size: 12))
                            .foregroundStyle(c.danger)
                    }
                }

                Section("备注") {
                    TextField("可选：本场复盘、错因…", text: $note, axis: .vertical)
                        .lineLimit(3)
                }

                if let errorText = errorText {
                    Section {
                        Text(errorText)
                            .font(.system(size: 12))
                            .foregroundStyle(c.danger)
                    }
                }

                Section {
                    Button {
                        save()
                    } label: {
                        Text("保存得分")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(c.background.ignoresSafeArea())
            .tint(c.accent)
            .navigationTitle("编辑得分")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { onClose() }
                }
            }
            .onAppear {
                errorText = nil
            }
        }
    }

    private var liveTotal: Int? {
        parse(totalText)
    }

    private var liveModuleSum: Int? {
        let values = drafts.compactMap { parse($0.text) }
        return values.isEmpty ? nil : values.reduce(0, +)
    }

    private var liveMismatch: String? {
        guard let total = liveTotal, let sum = liveModuleSum, total != sum else { return nil }
        return "模块得分合计 \(sum) ≠ 总得分 \(total)"
    }

    private func parse(_ text: String) -> Int? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }
        return Int(trimmed)
    }

    private func isValidNumber(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return true }
        guard let value = Int(trimmed) else { return false }
        return value >= 0
    }

    private var validationError: String? {
        if !isValidNumber(totalText) {
            return "总分需为非负整数，或留空。"
        }
        for draft in drafts {
            if !isValidNumber(draft.text) {
                return "「\(draft.name)」得分需为非负整数，或留空。"
            }
        }
        return nil
    }

    private func save() {
        if let error = validationError {
            errorText = error
            return
        }

        var moduleScores: [String: Int] = [:]
        for draft in drafts {
            if let value = parse(draft.text) {
                moduleScores[draft.id] = value
            }
        }

        onSave(
            SessionScoreUpdate(
                totalScore: parse(totalText),
                moduleScores: moduleScores,
                note: note
            )
        )
        onClose()
    }
}
