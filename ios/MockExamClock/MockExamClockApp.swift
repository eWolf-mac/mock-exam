//
//  MockExamClockApp.swift
//  MockExamClock
//
//  应用入口。
//

import SwiftUI

@main
struct MockExamClockApp: App {
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
        }
    }
}
