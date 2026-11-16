package com.tradepilot.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

// Plain HTTP to the merge site on the PC: reachability and the site's own symbol search
object Net {
    suspend fun status(url: String): Int? = withContext(Dispatchers.IO) {
        try {
            val c = URL(url).openConnection() as HttpURLConnection
            // (a first page can take a while to answer: the site warms up)
            c.connectTimeout = 5000; c.readTimeout = 15000; c.instanceFollowRedirects = false
            val code = c.responseCode
            c.disconnect(); code
        } catch (_: Exception) { null }
    }

    private suspend fun getJson(url: String): JSONObject? = withContext(Dispatchers.IO) {
        try {
            val c = URL(url).openConnection() as HttpURLConnection
            c.connectTimeout = 5000; c.readTimeout = 15000
            val body = c.inputStream.bufferedReader().use { it.readText() }
            c.disconnect(); JSONObject(body)
        } catch (_: Exception) { null }
    }

    data class Hit(val symbol: String, val name: String, val type: String, val exchange: String)

    // The site's /api/symbol-search (the same search as the chart's)
    suspend fun search(site: String, q: String): List<Hit>? {
        val j = getJson("$site/api/symbol-search?q=${URLEncoder.encode(q, "UTF-8")}") ?: return null
        val a = j.optJSONArray("data") ?: return emptyList()
        return (0 until a.length()).map { i ->
            val o = a.getJSONObject(i)
            Hit(o.optString("symbol"), o.optString("name"), o.optString("type"), o.optString("exchange"))
        }
    }
}
