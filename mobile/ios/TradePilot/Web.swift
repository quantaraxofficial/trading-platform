import SwiftUI
import WebKit

// The app's WKWebViews: the chart (the site's chart page in its app mode) and the site's other pages.
// The merge site calls its backend at http://localhost:8000 (its build's default); on the phone that's
// the PC's address instead, so calls are pointed there before the page's own scripts run.
enum Web {
    static let uaTag = "TradePilotApp/1.0 (ios)"
    // (one storage for all of them: signed in on the chart is signed in everywhere)
    static let processPool = WKProcessPool()

    static func rewriteScript(_ c: Connection) -> String {
        let h = c.backend, w = c.backend.replacingOccurrences(of: "http://", with: "ws://")
        return """
        (function(){
          if (window.__tpRewrite) return; window.__tpRewrite = 1;
          var H = '\(h)', W = '\(w)';
          var re = /^http:\\/\\/(localhost|127\\.0\\.0\\.1):8000/, rw = /^ws:\\/\\/(localhost|127\\.0\\.0\\.1):8000/;
          function fx(u) { return typeof u === 'string' ? u.replace(re, H).replace(rw, W) : u; }
          var f = window.fetch;
          window.fetch = function (i, o) {
            if (typeof i === 'string') i = fx(i);
            else if (i && i.url && re.test(i.url)) i = new Request(fx(i.url), i);
            else if (i instanceof URL) i = fx(i.toString());
            return f.call(this, i, o);
          };
          var xo = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function (m, u) { arguments[1] = fx(String(u)); return xo.apply(this, arguments); };
          var WS = window.WebSocket;
          if (WS) { var P = function (u, p) { return p === undefined ? new WS(fx(String(u))) : new WS(fx(String(u)), p); }; P.prototype = WS.prototype; P.CONNECTING = 0; P.OPEN = 1; P.CLOSING = 2; P.CLOSED = 3; window.WebSocket = P; }
          var ES = window.EventSource;
          if (ES) { var E = function (u, c) { return new ES(fx(String(u)), c); }; E.prototype = ES.prototype; window.EventSource = E; }
          // pictures from the backend (avatars, uploads) as they appear
          var fixImg = function (n) { if (n && n.tagName === 'IMG' && re.test(n.getAttribute('src') || '')) n.setAttribute('src', fx(n.getAttribute('src'))); };
          new MutationObserver(function (ms) { ms.forEach(function (m) { if (m.type === 'attributes') fixImg(m.target); else m.addedNodes.forEach(function (n) { fixImg(n); if (n.querySelectorAll) n.querySelectorAll('img').forEach(fixImg); }); }); })
            .observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
        })();
        """
    }

    @MainActor
    static func make(_ c: Connection, chart: Bool) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.processPool = processPool
        cfg.websiteDataStore = .default()
        cfg.applicationNameForUserAgent = uaTag
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        let uc = WKUserContentController()
        uc.addUserScript(WKUserScript(source: rewriteScript(c), injectionTime: .atDocumentStart, forMainFrameOnly: false))
        if chart { uc.add(Bridge.shared, name: "tradepilot") }
        cfg.userContentController = uc
        let w = WKWebView(frame: .zero, configuration: cfg)
        w.isOpaque = false
        w.backgroundColor = .black
        w.scrollView.bounces = false
        w.allowsBackForwardNavigationGestures = !chart
        #if DEBUG
        if #available(iOS 16.4, *) { w.isInspectable = true }
        #endif
        return w
    }
}

// Keeps a page's links to the merge site in the app; anything else opens in Safari
final class WebNav: NSObject, WKNavigationDelegate {
    let host: String
    var onLoading: (Bool) -> Void = { _ in }
    var onTitle: (String) -> Void = { _ in }
    var chart = false
    init(host: String) { self.host = host }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let u = action.request.url, let h = u.host else { decisionHandler(.allow); return }
        if h == host || h == "localhost" || h == "127.0.0.1" || u.scheme == "about" { decisionHandler(.allow); return }
        UIApplication.shared.open(u)
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        onLoading(true)
        if chart { Task { @MainActor in Bridge.shared.pageGone() } }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { onLoading(false); onTitle(webView.title ?? "") }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { onLoading(false) }
}

struct WebViewHost: UIViewRepresentable {
    let web: WKWebView
    func makeUIView(context: Context) -> WKWebView { web }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
