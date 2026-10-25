//
//  Theme.swift
//  MockExamClock
//
//  视觉主题：深色考场 + 浅色纸张两套配色。
//  只使用 SwiftUI 的颜色能力，不通过 UIColor 做动态色。
//

import SwiftUI

// MARK: - 十六进制颜色

extension Color {
    init(hex: UInt32, opacity: Double = 1.0) {
        let red = Double((hex >> 16) & 0xFF) / 255.0
        let green = Double((hex >> 8) & 0xFF) / 255.0
        let blue = Double(hex & 0xFF) / 255.0
        self.init(red: red, green: green, blue: blue, opacity: opacity)
    }
}

// MARK: - 调色板

struct ThemeColors {
    let background: Color
    let panel: Color
    let panelAlt: Color
    let text: Color
    let subtext: Color
    let accent: Color
    /// 主色按钮上的文字颜色
    let onAccent: Color
    let danger: Color
    let warning: Color
    let stroke: Color
    let track: Color
    /// 模块图表配色（SPEC 第 4 节）
    let modules: [Color]
}

enum Theme {
    static let moduleColors: [Color] = [
        Color(hex: 0x3DDC97),
        Color(hex: 0x4AA8FF),
        Color(hex: 0xFFC857),
        Color(hex: 0xB983FF),
        Color(hex: 0xFF7A9C),
        Color(hex: 0x5CE1E6),
        Color(hex: 0xF5A623),
        Color(hex: 0x93A7BA)
    ]

    static let dark = ThemeColors(
        background: Color(hex: 0x0B0F14),
        panel: Color(hex: 0x141A21),
        panelAlt: Color(hex: 0x1B232D),
        text: Color(hex: 0xE8EEF5),
        subtext: Color(hex: 0x8A98A8),
        accent: Color(hex: 0x3DDC97),
        onAccent: Color(hex: 0x07130D),
        danger: Color(hex: 0xFF5C5C),
        warning: Color(hex: 0xFFC857),
        stroke: Color(hex: 0x26313D),
        track: Color(hex: 0x222B35),
        modules: moduleColors
    )

    static let light = ThemeColors(
        background: Color(hex: 0xF4F1E8),
        panel: Color(hex: 0xFFFDF7),
        panelAlt: Color(hex: 0xECE8DC),
        text: Color(hex: 0x17202A),
        subtext: Color(hex: 0x5E6A75),
        accent: Color(hex: 0x0E9F6E),
        onAccent: Color(hex: 0xFFFFFF),
        danger: Color(hex: 0xD64045),
        warning: Color(hex: 0xA66A00),
        stroke: Color(hex: 0xD8D2C4),
        track: Color(hex: 0xE2DCCF),
        modules: moduleColors
    )

    static func colors(for scheme: ColorScheme) -> ThemeColors {
        scheme == .dark ? dark : light
    }

    /// 等宽数字字体（时钟 / 计时 / 表格数字）
    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    static func rounded(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
}

// MARK: - 卡片

struct ThemeCardModifier: ViewModifier {
    let colors: ThemeColors
    let padding: CGFloat

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(colors.panel)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(colors.stroke, lineWidth: 1)
            )
    }
}

extension View {
    func themeCard(_ colors: ThemeColors, padding: CGFloat = 16) -> some View {
        modifier(ThemeCardModifier(colors: colors, padding: padding))
    }

    /// 输入框外观
    func examField(_ colors: ThemeColors) -> some View {
        self
            .font(.system(size: 16))
            .foregroundStyle(colors.text)
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(colors.panelAlt)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(colors.stroke, lineWidth: 1)
            )
    }
}

// MARK: - 按钮样式

struct PrimaryButtonStyle: ButtonStyle {
    let colors: ThemeColors
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(colors.onAccent)
            .frame(maxWidth: fullWidth ? CGFloat.infinity : nil, minHeight: 50)
            .padding(.horizontal, fullWidth ? 16 : 20)
            .background(
                RoundedRectangle(cornerRadius: 15, style: .continuous)
                    .fill(colors.accent.opacity(configuration.isPressed ? 0.82 : 1.0))
            )
            .contentShape(Rectangle())
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    let colors: ThemeColors
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(colors.text)
            .frame(maxWidth: fullWidth ? CGFloat.infinity : nil, minHeight: 50)
            .padding(.horizontal, fullWidth ? 16 : 18)
            .background(
                RoundedRectangle(cornerRadius: 15, style: .continuous)
                    .fill(colors.panelAlt.opacity(configuration.isPressed ? 0.7 : 1.0))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 15, style: .continuous)
                    .stroke(colors.stroke, lineWidth: 1)
            )
            .contentShape(Rectangle())
    }
}

// MARK: - 小组件

/// 呼吸红点
struct PulsingDot: View {
    let color: Color
    @State private var bright = false

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 10, height: 10)
            .opacity(bright ? 1.0 : 0.35)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                    bright = true
                }
            }
    }
}

/// 状态 / 标签胶囊
struct StatusTag: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(color.opacity(0.14)))
    }
}
