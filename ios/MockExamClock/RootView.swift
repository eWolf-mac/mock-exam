//
//  RootView.swift
//  MockExamClock
//
//  根视图：三个 Tab + 新建考试 Sheet + 考试全屏页。
//

import SwiftUI
import Foundation

struct ExamTarget: Identifiable {
    let id: String
}

struct RootView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.colorScheme) private var scheme

    @State private var selectedTab: Int = 0
    @State private var showNewExam = false
    @State private var showSettings = false
    @State private var examTarget: ExamTarget? = nil
    @State private var pendingExamId: String? = nil

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView(
                selectedTab: $selectedTab,
                onNewExam: { showNewExam = true },
                onContinue: { continueRunning() },
                onSettings: { showSettings = true }
            )
            .tabItem {
                Label("首页", systemImage: "house.fill")
            }
            .tag(0)

            TemplateListView()
                .tabItem {
                    Label("模版", systemImage: "square.stack.3d.up.fill")
                }
                .tag(1)

            HistoryView()
                .tabItem {
                    Label("记录", systemImage: "clock.arrow.circlepath")
                }
                .tag(2)
        }
        .tint(Theme.colors(for: scheme).accent)
        .sheet(isPresented: $showNewExam, onDismiss: {
            // Sheet 完全收起后再弹全屏考试页，避免 presentation 冲突
            guard let id = pendingExamId else { return }
            pendingExamId = nil
            examTarget = ExamTarget(id: id)
        }) {
            NewExamView(onStarted: { id in
                pendingExamId = id
                showNewExam = false
            })
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .presentationDetents([.large])
        }
        .fullScreenCover(item: $examTarget) { target in
            ExamView(sessionId: target.id)
        }
    }

    private func continueRunning() {
        guard let session = store.runningSession else { return }
        selectedTab = 0
        examTarget = ExamTarget(id: session.id)
    }
}
