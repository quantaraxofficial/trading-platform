package com.tradepilot.app.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

// Where the merge site runs (the user's PC on their Wi-Fi) and the app's own choices
data class Connection(val host: String, val sitePort: Int = 3007, val backendPort: Int = 8000) {
    val site get() = "http://$host:$sitePort"
    val backend get() = "http://$host:$backendPort"
}

object Prefs {
    private lateinit var sp: SharedPreferences
    private val _connection = MutableStateFlow<Connection?>(null)
    val connection: StateFlow<Connection?> = _connection

    fun init(context: Context) {
        sp = context.getSharedPreferences("tradepilot", Context.MODE_PRIVATE)
        val host = sp.getString("host", "") ?: ""
        _connection.value = if (host.isBlank()) null
        else Connection(host, sp.getInt("sitePort", 3007), sp.getInt("backendPort", 8000))
    }

    fun saveConnection(c: Connection) {
        sp.edit().putString("host", c.host).putInt("sitePort", c.sitePort).putInt("backendPort", c.backendPort).apply()
        _connection.value = c
    }

    var guideSeen: Boolean
        get() = sp.getBoolean("guideSeen", false)
        set(v) { sp.edit().putBoolean("guideSeen", v).apply() }

    var recentSymbols: List<String>
        get() = (sp.getString("recent", "") ?: "").split('|').filter { it.isNotBlank() }
        set(v) { sp.edit().putString("recent", v.take(12).joinToString("|")).apply() }
}
