import SwiftUI

@main
struct TradePilotApp: App {
    @StateObject private var prefs = Prefs.shared
    @StateObject private var bridge = Bridge.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(prefs)
                .environmentObject(bridge)
                .preferredColorScheme(bridge.chart.theme == "light" ? .light : .dark)
        }
    }
}
