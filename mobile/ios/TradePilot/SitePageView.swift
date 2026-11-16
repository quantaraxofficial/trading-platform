import SwiftUI
import WebKit

// A page of the merge site (community, analytics, sign-in…) in the app, signed in as the chart is
struct SitePageView: View {
    let conn: Connection
    let path: String
    let title: String?
    @State private var web: WKWebView?
    @State private var nav: WebNav?
    @State private var loading = true
    @State private var pageTitle = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .top) {
            if let web { WebViewHost(web: web) }
            if loading { ProgressView().tint(Tp.purple).padding(.top, 12) }
        }
        .navigationTitle(title ?? pageTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if title != nil { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
            ToolbarItem(placement: .primaryAction) { Button { web?.reload() } label: { Image(systemName: "arrow.clockwise") } }
        }
        .onAppear {
            guard web == nil else { return }
            let w = Web.make(conn, chart: false)
            let n = WebNav(host: conn.host)
            n.onLoading = { v in Task { @MainActor in loading = v } }
            n.onTitle = { t in Task { @MainActor in pageTitle = t } }
            w.navigationDelegate = n
            w.load(URLRequest(url: URL(string: conn.site + path)!))
            web = w; nav = n
        }
    }
}
