//
//  ExamModuleSection.swift
//  MockExamClock
//
//  考试页的模块进度区：当前模块、模块列表、完成 / 撤销。
//

import SwiftUI
import Foundation

struct ExamModuleSection: View {
    let session: ExamSession
    let nowMs: Int
    let colors: ThemeColors
    var onComplete: () -> Void
    var onUndo: () -> Void

    private var c: ThemeColors { colors }

    private var currentIndex: Int? {
        session.modules.firstIndex(where: { $0.endedAt == nil })
    }

    private var completed: Int {
        session.completedModuleCount
    }

    private var hasCompletedModule: Bool {
        session.modules.contains { $0.endedAt != nil }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("模块进度")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(c.text)
                Spacer()
                Text("\(completed)/\(session.modules.count)")
                    .font(Theme.mono(12, weight: .semibold))
                    .foregroundStyle(c.subtext)
            }

            if let index = currentIndex, session.modules.indices.contains(index) {
                currentModuleView(session.modules[index], index: index, total: session.modules.count)
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Text("全部模块已完成")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(c.accent)
                    Text("可以交卷查看用时与得分分析。")
                        .font(.system(size: 12))
                        .foregroundStyle(c.subtext)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(c.panelAlt)
                )
            }

            moduleList

            HStack(spacing: 10) {
                Button {
                    onComplete()
                } label: {
                    Text(currentIndex == nil ? "全部完成" : "完成本模块 →")
                }
                .buttonStyle(PrimaryButtonStyle(colors: c))
                .disabled(currentIndex == nil)
                .opacity(currentIndex == nil ? 0.45 : 1.0)

                Button {
                    onUndo()
                } label: {
                    Label("撤销上一个", systemImage: "arrow.uturn.backward")
                }
                .buttonStyle(SecondaryButtonStyle(colors: c, fullWidth: false))
                .disabled(!hasCompletedModule)
                .opacity(hasCompletedModule ? 1.0 : 0.45)
            }
        }
        .themeCard(c)
    }

    private func currentModuleView(_ module: SessionModule, index: Int, total: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("当前模块 \(index + 1)/\(total)")
                    .font(.system(size: 11))
                    .foregroundStyle(c.subtext)
                Spacer()
                Text(TimeMath.durationText(TimeMath.moduleElapsedMs(module, realNowMs: nowMs)))
                    .font(Theme.mono(24, weight: .semibold))
                    .foregroundStyle(c.accent)
            }
            Text(module.name)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(c.text)
            Text("本模块计时中，完成后自动进入下一个")
                .font(.system(size: 11))
                .foregroundStyle(c.subtext)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(c.panelAlt)
        )
    }

    private var moduleList: some View {
        VStack(spacing: 0) {
            ForEach(session.modules.indices, id: \.self) { index in
                let isCurrent = currentIndex == index
                HStack(spacing: 10) {
                    Text("\(index + 1)")
                        .font(Theme.mono(11, weight: .bold))
                        .foregroundStyle(isCurrent ? c.onAccent : c.subtext)
                        .frame(width: 24, height: 24)
                        .background(
                            Circle().fill(isCurrent ? c.accent : c.track)
                        )

                    Text(session.modules[index].name)
                        .font(.system(size: 14, weight: isCurrent ? Font.Weight.semibold : Font.Weight.regular))
                        .foregroundStyle(moduleTextColor(session.modules[index], isCurrent: isCurrent))
                        .lineLimit(1)

                    Spacer()

                    Text(moduleStatusText(session.modules[index], isCurrent: isCurrent))
                        .font(Theme.mono(11, weight: .medium))
                        .foregroundStyle(moduleStatusColor(session.modules[index], isCurrent: isCurrent))
                }
                .padding(.vertical, 6)

                if index < session.modules.count - 1 {
                    Divider().overlay(c.stroke)
                }
            }
        }
    }

    private func moduleTextColor(_ module: SessionModule, isCurrent: Bool) -> Color {
        if module.endedAt != nil || isCurrent {
            return c.text
        }
        return c.subtext
    }

    private func moduleStatusText(_ module: SessionModule, isCurrent: Bool) -> String {
        if module.endedAt != nil {
            return TimeMath.durationText(module.elapsedMs)
        }
        if isCurrent {
            return "进行中"
        }
        return "待开始"
    }

    private func moduleStatusColor(_ module: SessionModule, isCurrent: Bool) -> Color {
        if module.endedAt != nil {
            return c.subtext
        }
        return isCurrent ? c.accent : c.subtext
    }
}
