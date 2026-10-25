//
//  ExamView.swift
//  MockExamClock
//
//  考试中全屏页面：虚拟考场时钟、模块计时、交卷 / 放弃。
//  计时全部基于 Date 时间戳差值，切后台、锁屏都不会漂移。
//

import SwiftUI
import Foundation
import Combine
import UIKit
import AudioToolbox

struct ExamView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss

    let sessionId: String

    @State private var nowMs: Int = TimeMath.nowMs()
    @State private var showSubmitConfirm = false
    @State private var showAbandonConfirm = false
    @State private var showAllDoneAlert = false
    @State private var showTimeUpOverlay = false
    @State private var didTriggerTimeUp = false
    @State private var blinkOn = false

    private let timer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()

    private var c: ThemeColors { Theme.colors(for: scheme) }

    var body: some View {
        ZStack {
            c.background.ignoresSafeArea()

            if let session = store.session(id: sessionId) {
                if session.status == .running {
                    examContent(session)
                        .overlay {
                            if showTimeUpOverlay {
                                timeUpOverlay
                            }
                        }
                } else if session.status == .finished {
                    NavigationStack {
                        ResultView(sessionId: sessionId, onClose: { dismiss() })
                    }
                } else {
                    Color.clear
                        .onAppear { dismiss() }
                }
            } else {
                missingView
            }
        }
        .onAppear {
            if store.settings.keepAwake {
                UIApplication.shared.isIdleTimerDisabled = true
            }
            nowMs = TimeMath.nowMs()
            checkOverdue()
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                blinkOn = true
            }
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
        }
        .onReceive(timer) { _ in
            tick()
        }
        .onChange(of: scenePhase) { _, newPhase in
            handleScenePhase(newPhase)
        }
        .alert("全部模块已完成", isPresented: $showAllDoneAlert) {
            Button("立即交卷") { finish(reason: .manual) }
            Button("继续检查", role: .cancel) { }
        } message: {
            Text("全部模块已完成，现在交卷？")
        }
        .confirmationDialog("提前交卷", isPresented: $showSubmitConfirm, titleVisibility: .visible) {
            Button("确认交卷", role: .destructive) { finish(reason: .manual) }
            Button("继续考试", role: .cancel) { }
        } message: {
            Text("交卷后立即生成用时与得分分析。")
        }
        .confirmationDialog("放弃本场", isPresented: $showAbandonConfirm, titleVisibility: .visible) {
            Button("放弃并退出", role: .destructive) { abandon() }
            Button("继续考试", role: .cancel) { }
        } message: {
            Text("本场将标记为已放弃，不进入考试记录。")
        }
    }

    // MARK: 进入 / 恢复 / 超时

    private func tick() {
        guard let session = store.session(id: sessionId), session.status == .running else { return }
        nowMs = TimeMath.nowMs()
        if TimeMath.sessionRemainingMs(session: session, realNowMs: nowMs) <= 0 {
            triggerTimeUp()
        }
    }

    private func checkOverdue() {
        guard let session = store.session(id: sessionId), session.status == .running else { return }
        if TimeMath.sessionRemainingMs(session: session, realNowMs: nowMs) <= 0 {
            triggerTimeUp()
        }
    }

    private func handleScenePhase(_ phase: ScenePhase) {
        if phase == .active {
            if store.settings.keepAwake {
                UIApplication.shared.isIdleTimerDisabled = true
            }
            nowMs = TimeMath.nowMs()
            checkOverdue()
        } else if phase == .background {
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }

    private func triggerTimeUp() {
        guard !didTriggerTimeUp else { return }
        guard let session = store.session(id: sessionId), session.status == .running else { return }
        didTriggerTimeUp = true

        if store.settings.sound {
            AudioServicesPlayAlertSound(SystemSoundID(1005))
        }
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()

        withAnimation(.easeInOut(duration: 0.25)) {
            showTimeUpOverlay = true
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
            UIApplication.shared.isIdleTimerDisabled = false
            store.finishSession(id: sessionId, reason: .timeup)
        }
    }

    // MARK: 主要布局

    private func examContent(_ session: ExamSession) -> some View {
        let virtualNow = TimeMath.virtualNow(session: session, realNowMs: nowMs)
        let elapsed = TimeMath.sessionElapsedMs(session: session, realNowMs: nowMs)
        let remaining = max(0, session.plan.durationMs - elapsed)
        let progress = session.plan.durationMs > 0
            ? min(1.0, Double(elapsed) / Double(session.plan.durationMs))
            : 0.0

        return ScrollView {
            VStack(spacing: 14) {
                statusBar
                clockCard(session: session, virtualNow: virtualNow)
                timeStats(session: session, elapsed: elapsed, remaining: remaining, progress: progress)
                ExamModuleSection(
                    session: session,
                    nowMs: nowMs,
                    colors: c,
                    onComplete: { completeModule() },
                    onUndo: { undoLast() }
                )
                bottomActions
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 26)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .background(c.background.ignoresSafeArea())
    }

    private var statusBar: some View {
        HStack(spacing: 8) {
            PulsingDot(color: c.danger)
            Text("考试进行中")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(c.text)
            Spacer()
            Text("现在 \(TimeMath.localTimeText())")
                .font(Theme.mono(11))
                .foregroundStyle(c.subtext)
        }
    }

    private func clockCard(session: ExamSession, virtualNow: Int) -> some View {
        VStack(spacing: 12) {
            HStack {
                Picker("时钟模式", selection: clockModeBinding) {
                    Text("数字").tag(ClockMode.digital)
                    Text("表盘").tag(ClockMode.analog)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(width: 150)

                Spacer()

                Text("\(TimeMath.shortClockText(session.plan.startVirtual)) – \(TimeMath.shortClockText(session.plan.endVirtual))")
                    .font(Theme.mono(12))
                    .foregroundStyle(c.subtext)
            }

            if store.settings.clockMode == .digital {
                Text(TimeMath.clockText(virtualNow))
                    .font(Theme.mono(64, weight: .semibold))
                    .foregroundStyle(c.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.42)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            } else {
                AnalogClockView(virtualMs: virtualNow, colors: c)
                    .frame(height: 220)
                    .frame(maxWidth: .infinity)
                Text(TimeMath.clockText(virtualNow))
                    .font(Theme.mono(20, weight: .medium))
                    .foregroundStyle(c.text)
            }

            Text("考试时间 \(TimeMath.shortClockText(session.plan.startVirtual)) – \(TimeMath.shortClockText(session.plan.endVirtual))")
                .font(.system(size: 12))
                .foregroundStyle(c.subtext)
        }
        .themeCard(c)
    }

    private func timeStats(session: ExamSession, elapsed: Int, remaining: Int, progress: Double) -> some View {
        let urgent = remaining <= 300_000

        return VStack(spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("剩余")
                        .font(.system(size: 11))
                        .foregroundStyle(c.subtext)
                    Text(TimeMath.countdownText(remaining))
                        .font(Theme.mono(30, weight: .semibold))
                        .foregroundStyle(urgent ? c.danger : c.text)
                        .opacity(urgent && blinkOn ? 0.55 : 1.0)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 3) {
                    Text("已用")
                        .font(.system(size: 11))
                        .foregroundStyle(c.subtext)
                    Text("\(elapsed / 60_000) 分钟")
                        .font(Theme.mono(20, weight: .medium))
                        .foregroundStyle(c.text)
                }
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(c.track)
                    Capsule()
                        .fill(progress >= 0.9 ? c.danger : c.accent)
                        .frame(width: max(0, geo.size.width * CGFloat(progress)))
                }
            }
            .frame(height: 8)

            HStack {
                Text("已用 \(TimeMath.percentText(progress))")
                Spacer()
                Text("共 \(session.plan.durationMs / 60_000) 分钟")
            }
            .font(.system(size: 11))
            .foregroundStyle(c.subtext)
        }
        .themeCard(c, padding: 14)
    }

    private var bottomActions: some View {
        HStack(spacing: 12) {
            Button {
                showSubmitConfirm = true
            } label: {
                Text("提前交卷")
            }
            .buttonStyle(SecondaryButtonStyle(colors: c))

            Button {
                showAbandonConfirm = true
            } label: {
                Text("放弃本场")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(c.danger)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .overlay(
                        RoundedRectangle(cornerRadius: 15, style: .continuous)
                            .stroke(c.danger.opacity(0.5), lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
        }
    }

    private var timeUpOverlay: some View {
        ZStack {
            c.danger.ignoresSafeArea()
            VStack(spacing: 14) {
                Image(systemName: "bell.fill")
                    .font(.system(size: 46))
                Text("考试结束")
                    .font(.system(size: 34, weight: .bold))
                Text("时间到，正在收卷…")
                    .font(.system(size: 16, weight: .medium))
                    .opacity(0.9)
            }
            .foregroundStyle(Color.white)
        }
        .transition(.opacity)
    }

    private var missingView: some View {
        VStack(spacing: 12) {
            Text("找不到这场考试")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(c.text)
            Button("关闭") { dismiss() }
                .buttonStyle(SecondaryButtonStyle(colors: c, fullWidth: false))
        }
    }

    // MARK: 动作

    private var clockModeBinding: Binding<ClockMode> {
        Binding(
            get: { store.settings.clockMode },
            set: { store.setClockMode($0) }
        )
    }

    private func completeModule() {
        guard let session = store.session(id: sessionId), session.status == .running else { return }
        guard session.modules.contains(where: { $0.endedAt == nil }) else { return }

        let allDone = store.completeCurrentModule(sessionId: sessionId)
        if store.settings.sound {
            AudioServicesPlaySystemSound(SystemSoundID(1104))
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()

        if allDone {
            showAllDoneAlert = true
        }
    }

    private func undoLast() {
        store.undoLastModule(sessionId: sessionId)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    private func finish(reason: FinishReason) {
        if reason == .manual {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
        UIApplication.shared.isIdleTimerDisabled = false
        store.finishSession(id: sessionId, reason: reason)
    }

    private func abandon() {
        store.discardSession(id: sessionId)
        dismiss()
    }
}
