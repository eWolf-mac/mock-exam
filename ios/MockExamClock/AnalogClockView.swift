//
//  AnalogClockView.swift
//  MockExamClock
//
//  考场挂钟风格的模拟表盘（SwiftUI Canvas）。
//

import SwiftUI
import Foundation

// MARK: - 模拟表盘

struct AnalogClockView: View {
    let virtualMs: Int
    let colors: ThemeColors

    var body: some View {
        Canvas { context, size in
            let side = min(size.width, size.height)
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = max(20, side / 2 - 6)

            let faceRect = CGRect(
                x: center.x - radius,
                y: center.y - radius,
                width: radius * 2,
                height: radius * 2
            )
            let face = Path(ellipseIn: faceRect)
            context.fill(face, with: .color(colors.panelAlt))
            context.stroke(face, with: .color(colors.stroke), lineWidth: 2)

            let innerRing = Path(ellipseIn: faceRect.insetBy(dx: 9, dy: 9))
            context.stroke(innerRing, with: .color(colors.stroke.opacity(0.55)), lineWidth: 1)

            // 60 个刻度，12 个整点刻度更长
            for tick in 0..<60 {
                let isMajor = tick % 5 == 0
                let angle = Double(tick) / 60.0 * 2.0 * Double.pi - Double.pi / 2.0
                let inner = radius - (isMajor ? 16 : 9)
                var tickPath = Path()
                tickPath.move(to: clockPoint(center: center, radius: inner, angle: angle))
                tickPath.addLine(to: clockPoint(center: center, radius: radius - 4, angle: angle))
                context.stroke(
                    tickPath,
                    with: .color(isMajor ? colors.text : colors.subtext.opacity(0.55)),
                    style: StrokeStyle(lineWidth: isMajor ? 2.4 : 1.0, lineCap: .round)
                )
            }

            let seconds = Double(virtualMs % 60_000) / 1000.0
            let minutes = Double((virtualMs / 60_000) % 60) + seconds / 60.0
            let hours = Double((virtualMs / 3_600_000) % 12) + minutes / 60.0

            let secondAngle = seconds / 60.0 * 2.0 * Double.pi - Double.pi / 2.0
            let minuteAngle = minutes / 60.0 * 2.0 * Double.pi - Double.pi / 2.0
            let hourAngle = hours / 12.0 * 2.0 * Double.pi - Double.pi / 2.0

            var hourPath = Path()
            hourPath.move(to: center)
            hourPath.addLine(to: clockPoint(center: center, radius: radius * 0.46, angle: hourAngle))
            context.stroke(
                hourPath,
                with: .color(colors.text),
                style: StrokeStyle(lineWidth: 7, lineCap: .round)
            )

            var minutePath = Path()
            minutePath.move(to: center)
            minutePath.addLine(to: clockPoint(center: center, radius: radius * 0.68, angle: minuteAngle))
            context.stroke(
                minutePath,
                with: .color(colors.text),
                style: StrokeStyle(lineWidth: 4.5, lineCap: .round)
            )

            var secondPath = Path()
            secondPath.move(to: clockPoint(center: center, radius: radius * 0.16, angle: secondAngle + Double.pi))
            secondPath.addLine(to: clockPoint(center: center, radius: radius * 0.80, angle: secondAngle))
            context.stroke(
                secondPath,
                with: .color(colors.danger),
                style: StrokeStyle(lineWidth: 1.6, lineCap: .round)
            )

            let dotRect = CGRect(x: center.x - 5, y: center.y - 5, width: 10, height: 10)
            context.fill(Path(ellipseIn: dotRect), with: .color(colors.accent))
        }
        .accessibilityLabel(Text("模拟表盘 \(TimeMath.clockText(virtualMs))"))
    }
}

private func clockPoint(center: CGPoint, radius: CGFloat, angle: Double) -> CGPoint {
    CGPoint(
        x: center.x + radius * CGFloat(cos(angle)),
        y: center.y + radius * CGFloat(sin(angle))
    )
}
