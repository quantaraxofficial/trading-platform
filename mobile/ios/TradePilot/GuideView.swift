import SwiftUI

// The app's first-run guide (the site's guided tours, for the phone): once, and again from Menu → Guide
struct GuideView: View {
    let onDone: () -> Void
    @State private var page = 0
    private let pages: [(String, String, String)] = [
        ("star", "Your watchlist", "The lists you keep on your PC, with live prices. Tap a symbol for its page, swipe to remove it, + to add one."),
        ("chart.xyaxis.line", "The chart, as on your PC", "Your layouts, indicators and drawings. The bar under it changes the symbol and timeframe, opens the drawing tools, indicators and everything else."),
        ("safari", "Everything TradePilot does", "Explore has analytics, bar replay, paper trading, Pine, the leaderboard and more. Menu has your account, theme and your PC's address."),
    ]

    var body: some View {
        VStack {
            HStack { Spacer(); Button("Skip", action: onDone).foregroundStyle(.secondary) }
            TabView(selection: $page) {
                ForEach(pages.indices, id: \.self) { i in
                    VStack(spacing: 24) {
                        RoundedRectangle(cornerRadius: 26).fill(Tp.gradient).frame(width: 96, height: 96)
                            .overlay(Image(systemName: pages[i].0).font(.system(size: 42)).foregroundColor(.white))
                        Text(pages[i].1).font(.title.bold()).multilineTextAlignment(.center)
                        Text(pages[i].2).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal, 8)
                    }
                    .tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            Button {
                if page == pages.count - 1 { onDone() } else { withAnimation { page += 1 } }
            } label: {
                Text(page == pages.count - 1 ? "Start" : "Next").font(.headline).frame(maxWidth: .infinity).frame(height: 50)
            }
            .buttonStyle(.borderedProminent).tint(Tp.purple)
        }
        .padding(24)
    }
}
