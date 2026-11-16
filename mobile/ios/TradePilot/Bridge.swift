import Foundation
import WebKit

// The native side of the site's lib/appBridge.ts. The chart page (always loaded, in the Chart tab's
// WKWebView) tells the app what the chart shows, who's signed in, the watchlists and their prices; the
// app's native screens send it commands.

struct ChartState: Equatable { var symbol = ""; var interval = ""; var theme = "dark"; var replay = false; var draw = false; var bottom = false }
struct AppUser: Equatable { var signedIn = false; var uid = ""; var name = ""; var email = ""; var photo = "" }

enum WlItem: Hashable, Identifiable {
    case section(id: String, name: String, collapsed: Bool)
    case symbol(String)
    var id: String { switch self { case .section(let id, _, _): return "s:" + id; case .symbol(let s): return "y:" + s } }
}
struct WlList: Identifiable, Equatable { var id: String; var name: String; var items: [WlItem]
    var symbols: [String] { items.compactMap { if case .symbol(let s) = $0 { return s } else { return nil } } }
}
struct Quote: Equatable {
    var name = "", exchange = "", currency = ""
    var last: Double?, change: Double?, changePct: Double?, open: Double?, high: Double?, low: Double?, prevClose: Double?, volume: Double?
    var marketOpen = false
}
struct Bar: Identifiable, Equatable { var t: Double; var o: Double; var h: Double; var l: Double; var c: Double; var id: Double { t } }

@MainActor
final class Bridge: NSObject, ObservableObject, WKScriptMessageHandler {
    static let shared = Bridge()
    weak var webView: WKWebView?

    @Published var ready = false
    @Published var chart = ChartState()
    @Published var user = AppUser()
    @Published var activeListId = ""
    @Published var lists: [WlList] = []
    @Published var quotes: [String: Quote] = [:]
    var activeList: WlList? { lists.first { $0.id == activeListId } ?? lists.first }

    private var waiting: [String: CheckedContinuation<[Bar], Never>] = [:]

    // ---- app → page
    func send(_ type: String, _ fields: [String: Any] = [:]) {
        var o = fields; o["type"] = type
        guard let data = try? JSONSerialization.data(withJSONObject: o), let json = String(data: data, encoding: .utf8) else { return }
        let quoted = (try? String(data: JSONSerialization.data(withJSONObject: [json]), encoding: .utf8))?.dropFirst().dropLast() ?? ""
        webView?.evaluateJavaScript("window.__tpApp&&window.__tpApp.cmd(\(quoted))")
    }
    func setSymbol(_ s: String) { send("setSymbol", ["symbol": s]) }
    func setInterval(_ iv: String) { send("setInterval", ["interval": iv]) }

    // A symbol page's chart: its bars, from the page (the same sources as the chart)
    func series(_ symbol: String, _ interval: String) async -> [Bar] {
        let id = UUID().uuidString
        return await withCheckedContinuation { (k: CheckedContinuation<[Bar], Never>) in
            waiting[id] = k
            send("series", ["id": id, "symbol": symbol, "interval": interval])
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: 25_000_000_000)
                self?.finish(id, [])
            }
        }
    }
    private func finish(_ id: String, _ bars: [Bar]) { if let k = waiting.removeValue(forKey: id) { k.resume(returning: bars) } }

    func pageGone() { ready = false }

    // ---- page → app
    nonisolated func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let s = message.body as? String, let d = s.data(using: .utf8), let m = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return }
        Task { @MainActor in self.receive(m) }
    }

    private func num(_ v: Any?) -> Double? { (v as? NSNumber)?.doubleValue }

    private func receive(_ m: [String: Any]) {
        switch m["type"] as? String {
        case "ready": ready = true; send("refresh")
        case "state":
            chart = ChartState(symbol: m["symbol"] as? String ?? "", interval: m["interval"] as? String ?? "", theme: m["theme"] as? String ?? "dark",
                               replay: m["replay"] as? Bool ?? false, draw: m["draw"] as? Bool ?? false, bottom: m["bottom"] as? Bool ?? false)
        case "user":
            user = (m["signedIn"] as? Bool ?? false)
                ? AppUser(signedIn: true, uid: m["uid"] as? String ?? "", name: m["name"] as? String ?? "", email: m["email"] as? String ?? "", photo: m["photo"] as? String ?? "")
                : AppUser()
        case "lists":
            activeListId = m["activeId"] as? String ?? ""
            lists = (m["lists"] as? [[String: Any]] ?? []).map { l in
                WlList(id: l["id"] as? String ?? "", name: l["name"] as? String ?? "", items: (l["items"] as? [[String: Any]] ?? []).compactMap { it in
                    switch it["kind"] as? String {
                    case "section": return .section(id: it["id"] as? String ?? "", name: it["name"] as? String ?? "", collapsed: it["collapsed"] as? Bool ?? false)
                    case "symbol": return .symbol(it["symbol"] as? String ?? "")
                    default: return nil
                    }
                })
            }
        case "quotes":
            var out = quotes
            for (k, v) in m["quotes"] as? [String: [String: Any]] ?? [:] {
                out[k] = Quote(name: v["name"] as? String ?? "", exchange: v["exchange"] as? String ?? "", currency: v["currency"] as? String ?? "",
                               last: num(v["last"]), change: num(v["change"]), changePct: num(v["changePct"]), open: num(v["open"]), high: num(v["high"]),
                               low: num(v["low"]), prevClose: num(v["prevClose"]), volume: num(v["volume"]), marketOpen: v["marketOpen"] as? Bool ?? false)
            }
            quotes = out
        case "series":
            let bars: [Bar] = (m["bars"] as? [[Any]] ?? []).compactMap { b in
                guard b.count >= 5, let t = num(b[0]), let o = num(b[1]), let h = num(b[2]), let l = num(b[3]), let c = num(b[4]) else { return nil }
                return Bar(t: t, o: o, h: h, l: l, c: c)
            }
            finish(m["id"] as? String ?? "", bars)
        default: break
        }
    }
}
