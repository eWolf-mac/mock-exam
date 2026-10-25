//
//  Analysis.swift
//  MockExamClock
//
//  结果页的派生数据：模块明细、效率标签、自动分析文字与分享文本。
//

import Foundation

// MARK: - 结果分析

/// 单个模块的分析结果
struct ModuleAnalysis: Identifiable {
    let id: String
    /// 在 session.modules 中的下标，用于分配图表颜色
    let colorIndex: Int
    let name: String
    let elapsedMs: Int
    let timeShare: Double
    let score: Int?
    let maxScore: Int?
    let scoreRate: Double?
    let scoreShare: Double?
    /// 优势 / 均衡 / 低效 / 重头 / 轻量 / nil
    let efficiency: String?
}

/// 结果页所需的全部派生数据与自动分析文字
struct SessionAnalysis {
    let session: ExamSession
    /// 开始到收卷的真实耗时
    let examElapsedMs: Int
    /// 计划时长
    let plannedMs: Int
    /// > 0 提前，< 0 超时，== 0 按时
    let deltaMs: Int
    /// 各模块用时之和
    let usedMs: Int
    let completedCount: Int
    let moduleCount: Int
    let coverage: Double
    let modules: [ModuleAnalysis]
    let moduleScoreSum: Int?
    let totalScore: Int?
    let planTotalScore: Int?
    let totalScoreRate: Double?
    let scoreMismatch: Bool
    let insights: [String]

    init(session: ExamSession) {
        self.session = session

        let examElapsed = session.examElapsedMs
        let planned = max(0, session.plan.durationMs)

        let used = session.modules.reduce(0) { $0 + max(0, $1.elapsedMs) }
        let completed = session.modules.filter { $0.endedAt != nil || $0.elapsedMs > 0 }.count
        let scored = session.modules.compactMap { $0.score }
        let scoreSum: Int? = scored.isEmpty ? nil : scored.reduce(0, +)

        self.examElapsedMs = examElapsed
        self.plannedMs = planned
        self.deltaMs = planned - examElapsed
        self.usedMs = used
        self.completedCount = completed
        self.moduleCount = session.modules.count
        self.coverage = session.modules.isEmpty ? 0 : Double(completed) / Double(session.modules.count)
        self.moduleScoreSum = scoreSum
        self.totalScore = session.totalScore
        self.planTotalScore = session.plan.totalScore

        var totalRate: Double? = nil
        if let total = session.totalScore, let maxScore = session.plan.totalScore, maxScore > 0 {
            totalRate = Double(total) / Double(maxScore)
        }
        self.totalScoreRate = totalRate

        var mismatch = false
        if let total = session.totalScore, let sum = scoreSum, total != sum {
            mismatch = true
        }
        self.scoreMismatch = mismatch

        var rows: [ModuleAnalysis] = []
        for (index, module) in session.modules.enumerated() {
            let elapsed = max(0, module.elapsedMs)
            let timeShare = used > 0 ? Double(elapsed) / Double(used) : 0

            var scoreShare: Double? = nil
            if let score = module.score, let sum = scoreSum, sum > 0 {
                scoreShare = Double(score) / Double(sum)
            }

            var moduleRate: Double? = nil
            if let score = module.score, let maxScore = module.maxScore, maxScore > 0 {
                moduleRate = Double(score) / Double(maxScore)
            }

            var efficiency: String? = nil
            if let share = scoreShare, timeShare > 0 {
                let ratio = share / timeShare
                if ratio >= 1.15 {
                    efficiency = "优势"
                } else if ratio >= 0.85 {
                    efficiency = "均衡"
                } else {
                    efficiency = "低效"
                }
            } else if timeShare >= 0.30 {
                efficiency = "重头"
            } else if timeShare > 0 && timeShare <= 0.10 {
                efficiency = "轻量"
            }

            rows.append(
                ModuleAnalysis(
                    id: module.id,
                    colorIndex: index,
                    name: module.name,
                    elapsedMs: elapsed,
                    timeShare: timeShare,
                    score: module.score,
                    maxScore: module.maxScore,
                    scoreRate: moduleRate,
                    scoreShare: scoreShare,
                    efficiency: efficiency
                )
            )
        }
        self.modules = rows

        self.insights = SessionAnalysis.makeInsights(
            modules: rows,
            usedMs: used,
            plannedMs: planned,
            deltaMs: planned - examElapsed,
            moduleCount: session.modules.count,
            completedCount: completed,
            moduleScoreSum: scoreSum,
            totalScore: session.totalScore,
            totalScoreRate: totalRate
        )
    }

    /// 是否至少录入了一个模块得分（决定结果页是否显示模块得分 / 效率列）
    var hasModuleScores: Bool {
        modules.contains { $0.score != nil }
    }

    /// 模块得分合计与总得分不一致时的提示
    var mismatchText: String? {
        guard scoreMismatch, let total = totalScore, let sum = moduleScoreSum else { return nil }
        return "模块得分合计 \(sum) ≠ 总得分 \(total)"
    }

    /// 复制到剪贴板的完整分析文本
    var shareText: String {
        var lines: [String] = []
        lines.append("【模拟考场】\(session.displayName)")

        let template = session.templateName.isEmpty ? "默认模块" : session.templateName
        lines.append("模版：\(template)")
        let timeRange = "\(TimeMath.shortClockText(session.plan.startVirtual)) – \(TimeMath.shortClockText(session.plan.endVirtual))"
        lines.append("考试时间：\(timeRange)（\(TimeMath.minutesText(session.plan.durationMs))）")
        lines.append("实际完成总用时：\(TimeMath.durationText(usedMs))")
        lines.append("考试耗时：\(TimeMath.durationText(examElapsedMs))")

        if deltaMs > 60_000 {
            lines.append("提前 \(TimeMath.durationText(deltaMs)) 交卷")
        } else if deltaMs < -60_000 {
            lines.append("超时 \(TimeMath.durationText(-deltaMs))")
        } else {
            lines.append("按计划时间收卷")
        }

        if let total = totalScore {
            if let maxScore = planTotalScore, maxScore > 0 {
                let rate = totalScoreRate.map { TimeMath.percentText($0) } ?? "—"
                lines.append("总分：\(total) / \(maxScore)（得分率 \(rate)）")
            } else {
                lines.append("总分：\(total) 分")
            }
        } else {
            lines.append("总分：未录入")
        }

        if let sum = moduleScoreSum {
            lines.append("模块得分合计：\(sum)")
        }

        lines.append("各模块：")
        for (index, module) in modules.enumerated() {
            var line = "\(index + 1). \(module.name)  用时 \(TimeMath.durationText(module.elapsedMs))  占比 \(TimeMath.percentText(module.timeShare))"
            if let score = module.score {
                if let maxScore = module.maxScore {
                    line += "  得分 \(score)/\(maxScore)"
                } else {
                    line += "  得分 \(score)"
                }
                if let rate = module.scoreRate {
                    line += "（\(TimeMath.percentText(rate))）"
                }
            }
            if let efficiency = module.efficiency {
                line += "  效率：\(efficiency)"
            }
            lines.append(line)
        }

        let note = session.note.trimmingCharacters(in: .whitespacesAndNewlines)
        if !note.isEmpty {
            lines.append("备注：\(note)")
        }

        lines.append("分析：")
        for (index, text) in insights.enumerated() {
            lines.append("\(index + 1). \(text)")
        }

        return lines.joined(separator: "\n")
    }

    private static func makeInsights(
        modules: [ModuleAnalysis],
        usedMs: Int,
        plannedMs: Int,
        deltaMs: Int,
        moduleCount: Int,
        completedCount: Int,
        moduleScoreSum: Int?,
        totalScore: Int?,
        totalScoreRate: Double?
    ) -> [String] {
        var items: [String] = []

        // 1. 用时最多的模块
        if let top = modules.max(by: { $0.elapsedMs < $1.elapsedMs }), top.elapsedMs > 0 {
            items.append("「\(top.name)」用时最多：\(TimeMath.durationText(top.elapsedMs))，占全部模块用时的 \(TimeMath.percentText(top.timeShare))。")
        }

        // 2. 得分率最高 / 最低的模块
        let rated = modules.filter { $0.scoreRate != nil }
        if rated.count > 0,
           let best = rated.max(by: { ($0.scoreRate ?? 0) < ($1.scoreRate ?? 0) }) {
            if rated.count > 1,
               let worst = rated.min(by: { ($0.scoreRate ?? 0) < ($1.scoreRate ?? 0) }),
               worst.id != best.id {
                items.append("得分率最高：「\(best.name)」\(TimeMath.percentText(best.scoreRate ?? 0))；最低：「\(worst.name)」\(TimeMath.percentText(worst.scoreRate ?? 0))。")
            } else {
                items.append("「\(best.name)」得分率 \(TimeMath.percentText(best.scoreRate ?? 0))。")
            }
        } else if let total = totalScore, let rate = totalScoreRate {
            items.append("本场总得分 \(total) 分，得分率 \(TimeMath.percentText(rate))。")
        }

        // 3. 投入偏高、建议压缩的模块（用时占比 - 得分占比 > 10 个百分点）
        let gaps = modules.filter { module in
            guard let share = module.scoreShare else { return false }
            return module.timeShare - share > 0.10 && module.elapsedMs > 0
        }.sorted { ($0.timeShare - ($0.scoreShare ?? 0)) > ($1.timeShare - ($1.scoreShare ?? 0)) }

        for module in gaps.prefix(2) {
            guard let share = module.scoreShare, module.timeShare > 0 else { continue }
            let targetMs = Double(module.elapsedMs) * share / module.timeShare
            let targetMinutes = max(3, Int((targetMs / 60_000.0).rounded()))
            let currentMinutes = max(1, Int((Double(module.elapsedMs) / 60_000.0).rounded()))
            if targetMinutes < currentMinutes {
                let timePct = TimeMath.percentText(module.timeShare)
                let scorePct = TimeMath.percentText(share)
                items.append("「\(module.name)」用时占 \(timePct)、得分占 \(scorePct)：投入偏高，可压缩到约 \(targetMinutes) 分钟（当前约 \(currentMinutes) 分钟）。")
            }
        }

        // 4. 提前 / 超时建议
        if deltaMs > 60_000 {
            items.append("比计划提前 \(TimeMath.durationText(deltaMs)) 收卷，剩余时间可用于回看标记题或检查答题卡。")
        } else if deltaMs < -60_000 {
            items.append("超出计划 \(TimeMath.durationText(-deltaMs))，下次可为最后两个模块预留 5–10 分钟检查时间。")
        }

        // 5. 未录入得分的提示
        if moduleScoreSum == nil {
            if totalScore == nil {
                items.append("尚未录入得分，补录得分后可看到投入产出分析与效率标签。")
            } else {
                items.append("目前只录入了总分，补录各模块得分后才能计算模块效率。")
            }
        }

        // 补齐到至少 3 条
        var fillers: [String] = []
        if completedCount > 0 {
            fillers.append("本场共完成 \(completedCount)/\(max(1, moduleCount)) 个模块，模块用时合计 \(TimeMath.durationText(usedMs))。")
            let average = usedMs / max(1, completedCount)
            fillers.append("平均每个已完成模块用时 \(TimeMath.minutesText(average))。")
        }
        if moduleCount > completedCount {
            fillers.append("有 \(moduleCount - completedCount) 个模块未开始计时，未计入用时合计。")
        }
        if plannedMs > 0 {
            let actual = max(0, plannedMs - deltaMs)
            fillers.append("计划时长 \(TimeMath.minutesText(plannedMs))，实际考试耗时 \(TimeMath.minutesText(actual))。")
        }

        for filler in fillers {
            if items.count >= 3 {
                break
            }
            if !items.contains(filler) {
                items.append(filler)
            }
        }

        if items.isEmpty {
            items.append("本场没有可用的模块用时记录。")
        }
        if items.count < 3 {
            items.append("本场没有留下完整的模块用时记录。")
        }
        if items.count < 3 {
            items.append("补录得分或再模拟一场，可以更清楚地看到时间分配。")
        }

        if items.count > 5 {
            items = Array(items.prefix(5))
        }

        return items
    }
}
