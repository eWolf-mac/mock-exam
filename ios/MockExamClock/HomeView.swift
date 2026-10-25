//
//  HomeView.swift
//  MockExamClock
//
//  首页与设置页。
//

import SwiftUI
import Foundation

struct HomeView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.colorScheme) private var scheme

    @Binding var selectedTab: Int
    var onNewExam: () -> Void
    var onContinue: () -> Void
    var onSettings: () -> Void

    private var c: ThemeColors { Theme.colors(for: scheme) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                if let session = store.runningSession {
                    runningCard(session)
                }

                if let warning = store.loadWarning {
                    warningBanner(warning)
                }

                quickStartCard
                lastSetupCard

                HStack(spacing: 12) {
                    entryCard(title: "模块模版", value: "\(store.templates.count) 个", icon: "square.stack.3d.up.fill") {
                        selectedTab = 1
                    }
                    entryCard(title: "考试记录", value: "\(store.finishedCount) 次", icon: "clock.arrow.circlepath") {
                        selectedTab = 2
                    }
                }

                footer
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .background(c.background.ignoresSafeArea())
    }

    // MARK: 品牌区

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Image(systemName: "timer")
                        .font(.system(size: 23, weight: .semibold))
                        .foregroundStyle(c.accent)
                    Text("模拟考场")
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(c.text)
                }
                Text("把任何时间，变成考场上的那两个小时")
                    .font(.system(size: 14))
                    .foregroundStyle(c.subtext)
            }
            Spacer()
            Button(action: onSettings) {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(c.subtext)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(c.panel))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("设置"))
        }
    }

    // MARK: 继续考试

    private func runningCard(_ session: ExamSession) -> some View {
        Button(action: onContinue) {
            HStack(spacing: 12) {
                PulsingDot(color: c.danger)
                VStack(alignment: .leading, spacing: 4) {
                    Text("有一场考试未结束")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(c.danger)
                    Text(session.displayName)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(c.text)
                        .lineLimit(1)
                    Text("\(TimeMath.shortClockText(session.plan.startVirtual)) – \(TimeMath.shortClockText(session.plan.endVirtual)) · 点击继续")
                        .font(Theme.mono(12))
                        .foregroundStyle(c.subtext)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(c.danger)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(c.panel)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(c.danger.opacity(0.35), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func warningBanner(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(c.warning)
            Text(text)
                .font(.system(size: 12))
                .foregroundStyle(c.subtext)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(c.warning.opacity(0.10))
        )
    }

    // MARK: 快速开始

    private var quickStartCard: some View {
        Button(action: onNewExam) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(c.onAccent.opacity(0.16))
                        .frame(width: 48, height: 48)
                    Image(systemName: "play.fill")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(c.onAccent)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text("快速开始")
                        .font(.system(size: 19, weight: .bold))
                        .foregroundStyle(c.onAccent)
                    Text("设定时间与模块，立即进入考场")
                        .font(.system(size: 12))
                        .foregroundStyle(c.onAccent.opacity(0.78))
                }
                Spacer()
                Image(systemName: "arrow.right")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(c.onAccent)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(c.accent)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: 上次设置

    private var lastSetupCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("上次设置")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(c.subtext)
            Text(lastSetupSummary)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(c.text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .themeCard(c, padding: 15)
    }

    private var lastSetupSummary: String {
        let setup = store.settings.lastSetup
        let range = "\(TimeMath.shortClockText(setup.startVirtual)) – \(TimeMath.shortClockText(setup.endVirtual))"
        let minutes = TimeMath.planMinutes(start: setup.startVirtual, end: setup.endVirtual)
        return "\(range) · \(minutes) 分钟 · \(lastSetupTemplateName)"
    }

    private var lastSetupTemplateName: String {
        let setup = store.settings.lastSetup
        if let id = setup.templateId {
            if let template = store.template(id: id) {
                return template.name
            }
            return "已删除的模版"
        }
        return "默认模块（\(setup.moduleCount) 个）"
    }

    // MARK: 入口

    private func entryCard(title: String, value: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(c.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(c.text)
                    Text(value)
                        .font(.system(size: 12))
                        .foregroundStyle(c.subtext)
                }
            }
            .themeCard(c, padding: 15)
        }
        .buttonStyle(.plain)
    }

    private var footer: some View {
        Text("数据只保存在本机 · 离线可用")
            .font(.system(size: 11))
            .foregroundStyle(c.subtext)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 6)
    }
}

// MARK: - 设置

struct SettingsView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss

    @State private var exportURL: URL? = nil

    private var c: ThemeColors { Theme.colors(for: scheme) }

    var body: some View {
        NavigationStack {
            List {
                Section("考试中") {
                    Toggle("提示音", isOn: Binding(
                        get: { store.settings.sound },
                        set: { store.setSoundEnabled($0) }
                    ))
                    Toggle("保持屏幕常亮", isOn: Binding(
                        get: { store.settings.keepAwake },
                        set: { store.setKeepAwake($0) }
                    ))
                    Picker("默认时钟", selection: Binding(
                        get: { store.settings.clockMode },
                        set: { store.setClockMode($0) }
                    )) {
                        Text("数字").tag(ClockMode.digital)
                        Text("表盘").tag(ClockMode.analog)
                    }
                }

                Section("数据") {
                    if let exportURL = exportURL {
                        ShareLink(item: exportURL) {
                            Label("分享 JSON 备份", systemImage: "square.and.arrow.up")
                        }
                    }
                    Text("数据文件：Application Support/mockexam.json")
                        .font(.system(size: 12))
                        .foregroundStyle(c.subtext)
                }

                Section("关于") {
                    Text("模拟考场 1.0")
                    Text("虚拟考场时钟 · 模块计时 · 成绩分析")
                        .font(.system(size: 12))
                        .foregroundStyle(c.subtext)
                }
            }
            .scrollContentBackground(.hidden)
            .background(c.background.ignoresSafeArea())
            .tint(c.accent)
            .navigationTitle("设置")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { dismiss() }
                }
            }
            .onAppear {
                exportURL = store.makeExportFile()
            }
        }
    }
}
