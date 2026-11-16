package com.tradepilot.app.web

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.tradepilot.app.BuildConfig
import com.tradepilot.app.bridge.Bridge
import com.tradepilot.app.data.Connection
import java.net.HttpURLConnection
import java.net.URL

// The app's WebViews: the chart (the site's chart page in its app mode) and the site's other pages.
// The merge site calls its backend at http://localhost:8000 (its build's default); on the phone that's
// the PC's address instead, so calls are pointed there before the page's own scripts run.
object Web {
    const val UA_TAG = "TradePilotApp/1.0 (android)"

    private fun rewriteScript(c: Connection) = """
(function(){
  if (window.__tpRewrite) return; window.__tpRewrite = 1;
  var H = ${org.json.JSONObject.quote(c.backend)}, W = ${org.json.JSONObject.quote(c.backend.replaceFirst("http", "ws"))};
  var re = /^http:\/\/(localhost|127\.0\.0\.1):8000/, rw = /^ws:\/\/(localhost|127\.0\.0\.1):8000/;
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
  if (WS) {
    var P = function (u, p) { return p === undefined ? new WS(fx(String(u))) : new WS(fx(String(u)), p); };
    P.prototype = WS.prototype; P.CONNECTING = 0; P.OPEN = 1; P.CLOSING = 2; P.CLOSED = 3;
    window.WebSocket = P;
  }
  var ES = window.EventSource;
  if (ES) { var E = function (u, c) { return new ES(fx(String(u)), c); }; E.prototype = ES.prototype; window.EventSource = E; }
})();
""".trimIndent()

    @SuppressLint("SetJavaScriptEnabled")
    fun create(context: Context, c: Connection, chart: Boolean, onTitle: (String) -> Unit = {}, onLoading: (Boolean) -> Unit = {}): WebView {
        val w = WebView(context)
        // (filling its place: at Compose's default "wrap content" height the page's vh units come out 0)
        w.layoutParams = android.view.ViewGroup.LayoutParams(android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.MATCH_PARENT)
        w.setBackgroundColor(Color.BLACK)
        with(w.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            userAgentString = "$userAgentString $UA_TAG"
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            loadWithOverviewMode = true
            useWideViewPort = true
        }
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        val script = rewriteScript(c)
        val earlyScript = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        if (earlyScript) WebViewCompat.addDocumentStartJavaScript(w, script, setOf("*"))
        if (chart) w.addJavascriptInterface(Bridge.JsPort(), "TradePilotAndroid")

        w.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                if (!earlyScript) view.evaluateJavascript(script, null)
                if (chart) Bridge.pageGone()
                onLoading(true)
            }
            override fun onPageFinished(view: WebView, url: String?) {
                onLoading(false)
                onTitle(view.title ?: "")
            }
            // Pages of the merge site stay in the app; anything else opens in the phone's browser
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == c.host || u.host == "localhost" || u.host == "127.0.0.1") return false
                try { context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, u).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
                return true
            }
            // Pictures and files the page asks of http://localhost:8000 (avatars, uploads): from the PC
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val u = request.url
                if (request.method != "GET" || u.port != 8000 || (u.host != "localhost" && u.host != "127.0.0.1")) return null
                return try {
                    val to = Uri.parse(c.backend).buildUpon().encodedPath(u.encodedPath).encodedQuery(u.encodedQuery).build()
                    val conn = URL(to.toString()).openConnection() as HttpURLConnection
                    conn.connectTimeout = 5000; conn.readTimeout = 15000
                    val type = (conn.contentType ?: "application/octet-stream").substringBefore(';')
                    WebResourceResponse(type, conn.contentEncoding ?: "utf-8", conn.responseCode, conn.responseMessage ?: "OK",
                        mapOf("Access-Control-Allow-Origin" to "*"), conn.inputStream)
                } catch (_: Exception) { null }
            }
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onReceivedTitle(view: WebView, title: String?) { onTitle(title ?: "") }
        }
        return w
    }
}
