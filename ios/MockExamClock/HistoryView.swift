//
//  HistoryView.swift
//  MockExamClock
//
//  考试记录：倒序列表，点开查看分析，左滑删除。
//

import SwiftUI
import Foundation

struct HistoryView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.colorScheme) private var scheme

    @State private var pendingDelete: ExamSession? = nil

    private var c: ThemeColors { Theme.colors(for: scheme) }

    var body: some View {
        NavigationStack {
            ZStack {
                c.background.ignoresSafeArea()

                if store.finishedSessions.isEmpty {
                    emptyView
                } else {
                    listView
                }
            }
            .navigationTitle("考试记录")
            .confirmationDialog(
                "删除记录",
                isPresented: Binding(
                    get: { pendingDelete != nil },
                    set: { if !$0 { pendingDelete = nil } }
                ),
                titleVisibility: .visible,
                presenting: pendingDelete
            ) { session in
                Button("删除「\(session.displayName)」", role: .destructive) {
                    store.deleteSession(id: session.id)
                    pendingDelete = nil
                }
                Button("取消", role: .cancel) {
                    pendingDelete = nil
                }
            } message: { _ in
                Text("删除后不可恢复。")
            }
        }
    }

    private var listView: some View {
        List {
            Section {
                ForEach(store.finishedSessions) { session in
                    NavigationLink {
                        ResultView(sessionId: session.id)
                    } label: {
                        row(session)
                    }
                    .listRowBackground(c.panel)
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            pendingDelete = session
                        } label: {
                            Label("删除", systemImage: "trash")
                        }
                    }
                }
            } footer: {
                Text("共 \(store.finishedSessions.count) 场 · 左滑删除")
            }
        }
        .scrollContentBackground(.hidden)
        .listStyle(.insetGrouped)
    }

    private func row(_ session: ExamSession) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 8) {
                Text(session.displayName)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(c.text)
                    .lineLimit(1)
                Spacer()
                StatusTag(text: statusText(session), color: statusColor(session))
            }

            HStack(spacing: 6) {
                Text(TimeMath.dateTimeText(session.finishedAt ?? session.startedAt))
                    .font(.system(size: 11))
                    .foregroundStyle(c.subtext)
                Text("·")
                    .foregroundStyle(c.subtext)
                Text("用时 \(TimeMath.durationText(session.examElapsedMs))")
                    .font(Theme.mono(11))
                    .foregroundStyle(c.subtext)
                if let score = session.totalScore {
                    Text("·")
                        .foregroundStyle(c.subtext)
                    Text("\(score) 分")
                        .font(Theme.mono(11, weight: .semibold))
                        .foregroundStyle(c.accent)
                }
            }

            Text(session.templateName.isEmpty ? "默认模块" : session.templateName)
                .font(.system(size: 11))
                .foregroundStyle(c.subtext)
                .lineLimit(1)
        }
        .padding(.vertical, 6)
    }

    private func statusText(_ session: ExamSession) -> String {
        if session.finishReason == .timeup {
            return "已完成 · 时间到"
        }
        return "已完成"
    }

    private func statusColor(_ session: ExamSession) -> Color {
        session.finishReason == .timeup ? c.warning : c.accent
    }

    private var emptyView: some View {
        VStack(spacing: 12) {
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 42, weight: .light))
                .foregroundStyle(c.accent)
            Text("还没有考试记录")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(c.text)
            Text("完成一场模拟考试后，用时与得分分析会保存在这里。")
                .font(.system(size: 13))
                .foregroundStyle(c.subtext)
                .multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
