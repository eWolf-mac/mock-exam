//
//  ResultView.swift
//  MockExamClock
//
//  成绩分析：概览、用时分布、模块明细、自动分析、得分补录、复制、删除。
//

import SwiftUI
import Foundation
import UIKit

struct ResultView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss

    let sessionId: String
    var onClose: (() -> Void)? = nil

    @State private var showScoreEditor = false
    @State private var showDeleteConfirm = false
    @State private var showCopied = false

    private var c: ThemeColors { Theme.colors(for: scheme) }

    private var session: ExamSession? {
        store.session(id: sessionId)
    }

    private var analysis: SessionAnalysis? {
        guard let session = session, session.status == .finished else { return nil }
        return SessionAnalysis(session: session)
    }

    var body: some View {
        ZStack {
            c.background.ignoresSafeArea()

            if let session = session, let analysis = analysis {
                content(session: session, analysis: analysis)
            } else {
                missingView
            }
        }
        .navigationTitle("成绩分析")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let onClose = onClose {
                    Button("完成") { onClose() }
                }
            }
        }
        .sheet(isPresented: $showScoreEditor) {
            if let session = session {
                ScoreEditView(
                    session: session,
                    onSave: { update in
                        store.updateScores(sessionId: sessionId, update: update)
                    },
                    onClose: { showScoreEditor = false }
                )
            }
        }
        .confirmationDialog("删除记录", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("删除", role: .destructive) { deleteRecord() }
            Button("取消", role: .cancel) { }
        } message: {
            Text("删除后不可恢复。")
        }
        .alert("已复制分析文本", isPresented: $showCopied) {
            Button("好", role: .cancel) { }
        }
    }

    // MARK: 内容

    private func content(session: ExamSession, analysis: SessionAnalysis) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header(session: session)
                overviewCard(analysis)
                timeDistributionCard(analysis)
                moduleTableCard(analysis)
                insightCard(analysis)
                actionButtons(analysis)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 30)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
    }

    private func header(session: ExamSession) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(session.displayName)
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(c.text)
                StatusTag(
                    text: session.finishReason == .timeup ? "时间到" : "已完成",
                    color: session.finishReason == .timeup ? c.warning : c.accent
                )
            }
            Text("\(templateName(session)) · \(TimeMath.dateTimeText(session.finishedAt ?? session.startedAt))")
                .font(.system(size: 12))
                .foregroundStyle(c.subtext)
            Text("考试时间 \(TimeMath.shortClockText(session.plan.startVirtual)) – \(TimeMath.shortClockText(session.plan.endVirtual))（\(TimeMath.minutesText(session.plan.durationMs))）")
                .font(.system(size: 12))
                .foregroundStyle(c.subtext)
        }
    }

    private func overviewCard(_ analysis: SessionAnalysis) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                metric(
                    "实际完成总用时",
                    TimeMath.durationText(analysis.usedMs),
                    sub: "\(analysis.completedCount)/\(analysis.moduleCount) 模块已计时"
                )
                metric(
                    "考试耗时",
                    TimeMath.durationText(analysis.examElapsedMs),
                    sub: "计划 \(TimeMath.minutesText(analysis.plannedMs))"
                )
            }

            Divider().overlay(c.stroke)

            HStack(spacing: 8) {
                StatusTag(text: deltaText(analysis), color: deltaColor(analysis))
                if analysis.coverage < 1.0 {
                    StatusTag(
                        text: "覆盖率 \(TimeMath.percentText(analysis.coverage))",
                        color: c.warning
                    )
                }
                Spacer()
            }

            Divider().overlay(c.stroke)

            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("得分")
                        .font(.system(size: 11))
                        .foregroundStyle(c.subtext)
                    scoreView(analysis)
                    if let mismatch = analysis.mismatchText {
                        Text(mismatch)
                            .font(.system(size: 11))
                            .foregroundStyle(c.danger)
                    }
                }
                Spacer()
                Button {
                    showScoreEditor = true
                } label: {
                    Label(hasAnyScore(analysis) ? "编辑得分" : "录入得分", systemImage: "square.and.pencil")
                }
                .buttonStyle(SecondaryButtonStyle(colors: c, fullWidth: false))
            }
        }
        .themeCard(c)
    }

    @ViewBuilder
    private func scoreView(_ analysis: SessionAnalysis) -> some View {
        if let total = analysis.totalScore {
            if let maxScore = analysis.planTotalScore, maxScore > 0 {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(total) / \(maxScore)")
                        .font(Theme.mono(28, weight: .bold))
                        .foregroundStyle(c.accent)
                    if let rate = analysis.totalScoreRate {
                        Text("得分率 \(TimeMath.percentText(rate))")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(c.text)
                    }
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(total) 分")
                        .font(Theme.mono(26, weight: .bold))
                        .foregroundStyle(c.accent)
                    Text("未设置总分")
                        .font(.system(size: 11))
                        .foregroundStyle(c.subtext)
                }
            }
        } else {
            Text("未录入得分")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(c.subtext)
        }
    }

    private func metric(_ title: String, _ value: String, sub: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 11))
                .foregroundStyle(c.subtext)
            Text(value)
                .font(Theme.mono(21, weight: .semibold))
                .foregroundStyle(c.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(sub)
                .font(.system(size: 10))
                .foregroundStyle(c.subtext)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func timeDistributionCard(_ analysis: SessionAnalysis) -> some View {
        let visible = analysis.modules.filter { $0.elapsedMs > 0 }

        return VStack(alignment: .leading, spacing: 12) {
            Text("用时分布")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(c.text)

            if visible.isEmpty {
                Text("暂无模块用时记录。")
                    .font(.system(size: 12))
                    .foregroundStyle(c.subtext)
            } else {
                GeometryReader { geo in
                    let spacing = CGFloat(max(0, visible.count - 1)) * 2
                    HStack(spacing: 2) {
                        ForEach(visible) { module in
                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .fill(moduleColor(module.colorIndex))
                                .frame(width: max(1, (geo.size.width - spacing) * CGFloat(module.timeShare)))
                        }
                    }
                }
                .frame(height: 12)
                .clipShape(Capsule())

                ForEach(visible) { module in
                    HStack(spacing: 8) {
                        Circle()
                            .fill(moduleColor(module.colorIndex))
                            .frame(width: 8, height: 8)
                        Text(module.name)
                            .font(.system(size: 12))
                            .foregroundStyle(c.text)
                            .lineLimit(1)
                        Spacer()
                        Text(TimeMath.durationText(module.elapsedMs))
                            .font(Theme.mono(11))
                            .foregroundStyle(c.text)
                        Text(TimeMath.percentText(module.timeShare))
                            .font(Theme.mono(11))
                            .foregroundStyle(c.subtext)
                            .frame(width: 40, alignment: .trailing)
                    }
                }
            }
        }
        .themeCard(c)
    }

    private func moduleTableCard(_ analysis: SessionAnalysis) -> some View {
        let showScore = analysis.hasModuleScores

        return VStack(alignment: .leading, spacing: 10) {
            Text("模块明细")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(c.text)

            HStack(spacing: 4) {
                Text("模块").frame(maxWidth: .infinity, alignment: .leading)
                Text("用时").frame(width: 52, alignment: .trailing)
                Text("占比").frame(width: 42, alignment: .trailing)
                if showScore {
                    Text("得分").frame(width: 58, alignment: .trailing)
                    Text("效率").frame(width: 38, alignment: .trailing)
                }
            }
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(c.subtext)

            ForEach(analysis.modules) { module in
                moduleRow(module, showScore: showScore)
                if module.id != analysis.modules.last?.id {
                    Divider().overlay(c.stroke)
                }
            }
        }
        .themeCard(c)
    }

    private func moduleRow(_ module: ModuleAnalysis, showScore: Bool) -> some View {
        HStack(spacing: 4) {
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(moduleColor(module.colorIndex))
                    .frame(width: 4, height: 20)
                Text(module.name)
                    .font(.system(size: 12))
                    .foregroundStyle(c.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(TimeMath.durationText(module.elapsedMs))
                .font(Theme.mono(11))
                .foregroundStyle(c.text)
                .frame(width: 52, alignment: .trailing)

            Text(TimeMath.percentText(module.timeShare))
                .font(Theme.mono(11))
                .foregroundStyle(c.subtext)
                .frame(width: 42, alignment: .trailing)

            if showScore {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(scoreText(module))
                        .font(Theme.mono(11, weight: .semibold))
                        .foregroundStyle(c.text)
                    if let rate = module.scoreRate {
                        Text(TimeMath.percentText(rate))
                            .font(Theme.mono(9))
                            .foregroundStyle(c.subtext)
                    }
                }
                .frame(width: 58, alignment: .trailing)

                Text(module.efficiency ?? "—")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(efficiencyColor(module.efficiency))
                    .frame(width: 38, alignment: .trailing)
            }
        }
    }

    private func insightCard(_ analysis: SessionAnalysis) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .foregroundStyle(c.accent)
                Text("自动分析")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(c.text)
            }

            ForEach(analysis.insights.indices, id: \.self) { index in
                HStack(alignment: .top, spacing: 8) {
                    Text("\(index + 1)")
                        .font(Theme.mono(10, weight: .bold))
                        .foregroundStyle(c.onAccent)
                        .frame(width: 18, height: 18)
                        .background(Circle().fill(c.accent))
                    Text(analysis.insights[index])
                        .font(.system(size: 13))
                        .foregroundStyle(c.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .themeCard(c)
    }

    private func actionButtons(_ analysis: SessionAnalysis) -> some View {
        VStack(spacing: 10) {
            Button {
                showScoreEditor = true
            } label: {
                Label(hasAnyScore(analysis) ? "编辑得分" : "录入得分", systemImage: "square.and.pencil")
            }
            .buttonStyle(PrimaryButtonStyle(colors: c))

            Button {
                copyAnalysis(analysis)
            } label: {
                Label("复制分析文本", systemImage: "doc.on.doc")
            }
            .buttonStyle(SecondaryButtonStyle(colors: c))

            Button(role: .destructive) {
                showDeleteConfirm = true
            } label: {
                Text("删除记录")
                    .font(.system(size: 14, weight: .semibold))
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.plain)
            .foregroundStyle(c.danger)
        }
    }

    private var missingView: some View {
        VStack(spacing: 12) {
            Text("记录不存在或尚未完成")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(c.text)
            Button("关闭") { close() }
                .buttonStyle(SecondaryButtonStyle(colors: c, fullWidth: false))
        }
    }

    // MARK: 小工具

    private func templateName(_ session: ExamSession) -> String {
        session.templateName.isEmpty ? "默认模块" : session.templateName
    }

    private func hasAnyScore(_ analysis: SessionAnalysis) -> Bool {
        analysis.totalScore != nil || analysis.moduleScoreSum != nil
    }

    private func deltaText(_ analysis: SessionAnalysis) -> String {
        if analysis.deltaMs > 60_000 {
            return "提前 \(TimeMath.durationText(analysis.deltaMs)) 交卷"
        }
        if analysis.deltaMs < -60_000 {
            return "超时 \(TimeMath.durationText(-analysis.deltaMs))"
        }
        return "按计划收卷"
    }

    private func deltaColor(_ analysis: SessionAnalysis) -> Color {
        if analysis.deltaMs < -60_000 { return c.danger }
        if analysis.deltaMs > 60_000 { return c.accent }
        return c.subtext
    }

    private func moduleColor(_ index: Int) -> Color {
        guard !c.modules.isEmpty else { return c.accent }
        return c.modules[index % c.modules.count]
    }

    private func scoreText(_ module: ModuleAnalysis) -> String {
        guard let score = module.score else { return "—" }
        if let maxScore = module.maxScore {
            return "\(score)/\(maxScore)"
        }
        return "\(score)"
    }

    private func efficiencyColor(_ label: String?) -> Color {
        guard let label = label else { return c.subtext }
        switch label {
        case "优势":
            return c.accent
        case "低效":
            return c.danger
        case "重头":
            return c.warning
        case "轻量":
            return c.accent
        default:
            return c.text
        }
    }

    private func copyAnalysis(_ analysis: SessionAnalysis) {
        UIPasteboard.general.string = analysis.shareText
        showCopied = true
    }

    private func deleteRecord() {
        store.deleteSession(id: sessionId)
        close()
    }

    private func close() {
        if let onClose = onClose {
            onClose()
        } else {
            dismiss()
        }
    }
}
