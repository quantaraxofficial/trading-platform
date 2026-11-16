import SwiftUI

private struct Feature: Identifiable {
    let icon: String, title: String, text: String, tint: Color
    let go: @MainActor (AppNav) -> Void
    var id: String { title }
}

// TradePilot's own features (and the chart's tools), each one tap away
private let features: [Feature] = [
    .init(icon: "chart.bar.doc.horizontal", title: "Analytics", text: "Your trading journal and backtest sessions", tint: Tp.purple) { $0.page = SitePage(path: "/analytics", title: "Analytics") },
    .init(icon: "clock.arrow.circlepath", title: "Bar replay", text: "Trade the past, bar by bar", tint: .green) { $0.toChart("replay") },
    .init(icon: "arrow.up.arrow.down", title: "Paper trading", text: "Orders and positions on the chart", tint: Tp.up) { $0.toChart("trade") },
    .init(icon: "chevron.left.forwardslash.chevron.right", title: "Pine Editor", text: "Write and run strategies", tint: .blue) { $0.toChart("pine") },
    .init(icon: "bell", title: "Alerts", text: "Price and indicator alerts", tint: .orange) { $0.toChart("alerts") },
    .init(icon: "trophy", title: "Leaderboard", text: "The traders on top", tint: .yellow) { $0.page = SitePage(path: "/leaderboard", title: "Leaderboard") },
    .init(icon: "play.rectangle", title: "Reels", text: "Short trading videos", tint: .pink) { $0.page = SitePage(path: "/reels", title: "Reels") },
    .init(icon: "crown", title: "Plans", text: "What each plan includes", tint: .indigo) { $0.page = SitePage(path: "/pricing", title: "Plans") },
    .init(icon: "questionmark.circle", title: "Q&A", text: "Answers about TradePilot", tint: .gray) { $0.page = SitePage(path: "/faq", title: "Q&A") },
]

struct ExploreView: View {
    @EnvironmentObject var nav: AppNav
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    ForEach(features) { f in
                        Button { f.go(nav) } label: {
                            VStack(alignment: .leading, spacing: 10) {
                                RoundedRectangle(cornerRadius: 10).fill(f.tint.gradient).frame(width: 38, height: 38)
                                    .overlay(Image(systemName: f.icon).foregroundColor(.white))
                                Text(f.title).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                                Text(f.text).font(.caption).foregroundStyle(.secondary).lineLimit(2, reservesSpace: true).multilineTextAlignment(.leading)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                    }
                }
                .padding(14)
            }
            .navigationTitle("Explore")
        }
    }
}
