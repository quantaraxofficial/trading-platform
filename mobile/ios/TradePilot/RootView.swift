import SwiftUI
import WebKit

enum AppTab: Hashable { case watchlist, chart, explore, community, menu }
enum SearchFor { case watchlist, chart }

// What screens can ask of the app around them
final class AppNav: ObservableObject {
    @Published var tab: AppTab = .watchlist
    @Published var search: SearchFor?
    @Published var symbol: String?
    @Published var page: SitePage?
    @Published var connect = false
    @Published var guide = false

    // the chart: this symbol, in the Chart tab
    @MainActor func chart(_ s: String) {
        Bridge.shared.setSymbol(s)
        Prefs.shared.remember(s)
        search = nil; symbol = nil; page = nil
        tab = .chart
    }
    @MainActor func toChart(_ cmd: String, _ fields: [String: Any] = [:]) {
        search = nil; symbol = nil; page = nil
        tab = .chart
        Bridge.shared.send(cmd, fields)
    }
}

struct SitePage: Identifiable, Hashable { var path: String; var title: String; var id: String { path } }

struct RootView: View {
    @EnvironmentObject var prefs: Prefs
    var body: some View {
        if let c = prefs.connection {
            if prefs.guideSeen { MainView(conn: c).id(c.host + "\(c.sitePort)") }
            else { GuideView { prefs.guideSeen = true } }
        } else {
            ConnectView(initial: nil) { prefs.save($0) }
        }
    }
}

struct MainView: View {
    let conn: Connection
    @StateObject private var nav = AppNav()
    @State private var chartWeb: WKWebView?
    @State private var chartNav: WebNav?

    var body: some View {
        TabView(selection: $nav.tab) {
            WatchlistView().tag(AppTab.watchlist).tabItem { Label("Watchlist", systemImage: "star") }
            Group {
                if let w = chartWeb { ChartTab(web: w) } else { Color.black }
            }
            .tag(AppTab.chart).tabItem { Label("Chart", systemImage: "chart.xyaxis.line") }
            ExploreView().tag(AppTab.explore).tabItem { Label("Explore", systemImage: "safari") }
            SitePageView(conn: conn, path: "/community", title: nil).tag(AppTab.community).tabItem { Label("Community", systemImage: "person.2") }
            MenuView(conn: conn).tag(AppTab.menu).tabItem { Label("Menu", systemImage: "line.3.horizontal") }
        }
        .tint(Tp.purple)
        .environmentObject(nav)
        .onAppear {
            // The chart page: loaded once and kept (it's also where the watchlists and prices come from)
            guard chartWeb == nil else { return }
            let w = Web.make(conn, chart: true)
            let n = WebNav(host: conn.host); n.chart = true
            w.navigationDelegate = n
            Bridge.shared.webView = w
            w.load(URLRequest(url: URL(string: "\(conn.site)/chart")!))
            chartWeb = w; chartNav = n
        }
        .fullScreenCover(item: Binding(get: { nav.search.map { SearchItem(purpose: $0) } }, set: { if $0 == nil { nav.search = nil } })) { s in
            SearchView(purpose: s.purpose).environmentObject(nav).environmentObject(prefs)
        }
        .sheet(item: Binding(get: { nav.symbol.map { SymbolItem(symbol: $0) } }, set: { if $0 == nil { nav.symbol = nil } })) { s in
            SymbolView(symbol: s.symbol).environmentObject(nav).environmentObject(Bridge.shared)
        }
        .sheet(item: $nav.page) { p in
            NavigationStack { SitePageView(conn: conn, path: p.path, title: p.title) }
        }
        .sheet(isPresented: $nav.connect) {
            ConnectView(initial: conn) { prefs.save($0); nav.connect = false }
        }
        .fullScreenCover(isPresented: $nav.guide) { GuideView { nav.guide = false } }
    }

    @EnvironmentObject private var prefs: Prefs
}

private struct SearchItem: Identifiable { let purpose: SearchFor; var id: String { purpose == .chart ? "chart" : "watchlist" } }
private struct SymbolItem: Identifiable { let symbol: String; var id: String { symbol } }
