import SwiftUI

struct MenuView: View {
    let conn: Connection
    @EnvironmentObject var bridge: Bridge
    @EnvironmentObject var nav: AppNav
    @State private var about = false

    var body: some View {
        NavigationStack {
            List {
                // Who's signed in (or sign in)
                Button {
                    nav.page = bridge.user.signedIn ? SitePage(path: "/profile", title: "Profile") : SitePage(path: "/login", title: "Sign in")
                } label: {
                    HStack(spacing: 14) {
                        Circle().fill(Tp.gradient).frame(width: 52, height: 52)
                            .overlay(Group {
                                if bridge.user.signedIn { Text(String((bridge.user.name.isEmpty ? bridge.user.email : bridge.user.name).prefix(1)).uppercased()).font(.title2.bold()).foregroundColor(.white) }
                                else { Image(systemName: "person").foregroundColor(.white) }
                            })
                        VStack(alignment: .leading, spacing: 2) {
                            Text(bridge.user.signedIn ? (bridge.user.name.isEmpty ? bridge.user.email : bridge.user.name) : "Sign in").font(.headline).foregroundStyle(.primary)
                            Text(bridge.user.signedIn ? bridge.user.email : "Your watchlists, layouts and trades on every device").font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 6)
                }

                Section("Trading") {
                    item("bell", "Alerts") { nav.toChart("alerts") }
                    item("arrow.up.arrow.down", "Paper trading") { nav.toChart("trade") }
                    item("chevron.left.forwardslash.chevron.right", "Pine Editor") { nav.toChart("pine") }
                    item("chart.bar.doc.horizontal", "Analytics and backtests") { nav.page = SitePage(path: "/analytics", title: "Analytics") }
                }
                Section("App") {
                    let dark = bridge.chart.theme != "light"
                    item(dark ? "sun.max" : "moon", dark ? "Light theme" : "Dark theme") { bridge.send("theme", ["theme": dark ? "light" : "dark"]) }
                    item("gearshape", "Chart settings") { nav.toChart("settings") }
                    Button { nav.connect = true } label: {
                        HStack { Label("Your PC", systemImage: "wifi").foregroundStyle(.primary); Spacer(); Text(conn.host).foregroundStyle(.secondary) }
                    }
                    item("book", "Guide") { nav.guide = true }
                    item("info.circle", "About") { about = true }
                }
                if bridge.user.signedIn {
                    Section { Button(role: .destructive) { bridge.send("logout") } label: { Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right") } }
                }
            }
            .navigationTitle("Menu")
            .alert("TradePilot", isPresented: $about) { Button("OK") {} } message: {
                Text("Version \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")\nThe merge edition, on your PC at \(conn.site).")
            }
        }
    }

    private func item(_ icon: String, _ label: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) { Label(label, systemImage: icon).foregroundStyle(.primary) }
    }
}
