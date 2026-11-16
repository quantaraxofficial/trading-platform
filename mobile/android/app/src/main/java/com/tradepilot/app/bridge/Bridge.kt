package com.tradepilot.app.bridge

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// The native side of the site's lib/appBridge.ts. The chart page (always loaded, in the Chart tab's
// WebView) tells the app what the chart shows, who's signed in, the watchlists and their prices; the
// app's native screens send it commands.

data class ChartState(
    val symbol: String = "", val interval: String = "", val theme: String = "dark",
    val replay: Boolean = false, val draw: Boolean = false, val bottom: Boolean = false,
)

data class AppUser(val signedIn: Boolean = false, val uid: String = "", val name: String = "", val email: String = "", val photo: String = "")

sealed interface WlItem {
    data class Section(val id: String, val name: String, val collapsed: Boolean) : WlItem
    data class Symbol(val symbol: String) : WlItem
}

data class WlList(val id: String, val name: String, val items: List<WlItem>) {
    val symbols get() = items.filterIsInstance<WlItem.Symbol>().map { it.symbol }
}

data class Lists(val activeId: String = "", val lists: List<WlList> = emptyList()) {
    val active get() = lists.firstOrNull { it.id == activeId } ?: lists.firstOrNull()
}

data class Quote(
    val name: String, val exchange: String, val currency: String,
    val last: Double?, val change: Double?, val changePct: Double?,
    val open: Double?, val high: Double?, val low: Double?, val prevClose: Double?, val volume: Double?,
    val marketOpen: Boolean,
)

data class Bar(val t: Long, val o: Double, val h: Double, val l: Double, val c: Double)

object Bridge {
    private val main = Handler(Looper.getMainLooper())
    var webView: WebView? = null

    private val _ready = MutableStateFlow(false)
    val ready: StateFlow<Boolean> = _ready
    private val _chart = MutableStateFlow(ChartState())
    val chart: StateFlow<ChartState> = _chart
    private val _user = MutableStateFlow(AppUser())
    val user: StateFlow<AppUser> = _user
    private val _lists = MutableStateFlow(Lists())
    val lists: StateFlow<Lists> = _lists
    private val _quotes = MutableStateFlow<Map<String, Quote>>(emptyMap())
    val quotes: StateFlow<Map<String, Quote>> = _quotes

    private val waiting = ConcurrentHashMap<String, CompletableDeferred<List<Bar>>>()

    // ---- app → page
    fun send(type: String, vararg fields: Pair<String, Any?>) {
        val o = JSONObject().put("type", type)
        for ((k, v) in fields) o.put(k, v ?: JSONObject.NULL)
        val js = "window.__tpApp&&window.__tpApp.cmd(${JSONObject.quote(o.toString())})"
        main.post { webView?.evaluateJavascript(js, null) }
    }

    fun setSymbol(s: String) = send("setSymbol", "symbol" to s)
    fun setInterval(iv: String) = send("setInterval", "interval" to iv)

    // A symbol page's chart: its bars, from the page (the same sources as the chart)
    suspend fun series(symbol: String, interval: String): List<Bar>? {
        val id = UUID.randomUUID().toString()
        val d = CompletableDeferred<List<Bar>>()
        waiting[id] = d
        send("series", "id" to id, "symbol" to symbol, "interval" to interval)
        val bars = withTimeoutOrNull(25_000) { d.await() }
        waiting.remove(id)
        return bars
    }

    fun pageGone() { _ready.value = false }

    // ---- page → app
    fun receive(json: String) {
        val m = try { JSONObject(json) } catch (_: Exception) { return }
        when (m.optString("type")) {
            "ready" -> { _ready.value = true; send("refresh") }
            "state" -> _chart.value = ChartState(
                m.optString("symbol"), m.optString("interval"), m.optString("theme", "dark"),
                m.optBoolean("replay"), m.optBoolean("draw"), m.optBoolean("bottom"),
            )
            "user" -> _user.value = if (m.optBoolean("signedIn")) AppUser(true, m.optString("uid"), m.optString("name"), m.optString("email"), m.optString("photo")) else AppUser()
            "lists" -> _lists.value = parseLists(m)
            "quotes" -> {
                val q = m.optJSONObject("quotes") ?: return
                val out = HashMap(_quotes.value)
                for (k in q.keys()) out[k] = parseQuote(q.getJSONObject(k))
                _quotes.value = out
            }
            "series" -> {
                val id = m.optString("id")
                val a = m.optJSONArray("bars") ?: JSONArray()
                val bars = (0 until a.length()).mapNotNull { i ->
                    val b = a.optJSONArray(i) ?: return@mapNotNull null
                    Bar(b.optLong(0), b.optDouble(1), b.optDouble(2), b.optDouble(3), b.optDouble(4))
                }.filter { !it.c.isNaN() }
                waiting[id]?.complete(bars)
            }
        }
    }

    private fun num(o: JSONObject, k: String): Double? = if (o.isNull(k) || !o.has(k)) null else o.optDouble(k).takeIf { !it.isNaN() }

    private fun parseQuote(o: JSONObject) = Quote(
        o.optString("name"), o.optString("exchange"), o.optString("currency"),
        num(o, "last"), num(o, "change"), num(o, "changePct"),
        num(o, "open"), num(o, "high"), num(o, "low"), num(o, "prevClose"), num(o, "volume"),
        o.optBoolean("marketOpen"),
    )

    private fun parseLists(m: JSONObject): Lists {
        val arr = m.optJSONArray("lists") ?: JSONArray()
        val lists = (0 until arr.length()).map { i ->
            val l = arr.getJSONObject(i)
            val items = l.optJSONArray("items") ?: JSONArray()
            WlList(l.optString("id"), l.optString("name"), (0 until items.length()).mapNotNull { j ->
                val it = items.getJSONObject(j)
                when (it.optString("kind")) {
                    "section" -> WlItem.Section(it.optString("id"), it.optString("name"), it.optBoolean("collapsed"))
                    "symbol" -> WlItem.Symbol(it.optString("symbol"))
                    else -> null
                }
            })
        }
        return Lists(m.optString("activeId"), lists)
    }

    // The object the page sees as window.TradePilotAndroid
    class JsPort {
        @JavascriptInterface
        fun postMessage(json: String) = receive(json)
    }
}
