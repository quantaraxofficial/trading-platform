package com.tradepilot.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import kotlin.math.abs

object Fmt {
    // Prices with as many decimals as they need (forex 5, gold 2, crypto under 1 more)
    private fun decimals(a: Double) = when { a >= 10 -> 2; a >= 1 -> 4; a >= 0.01 -> 5; else -> 8 }
    fun price(v: Double?): String = if (v == null) "—" else String.format(Locale.US, "%,.${decimals(abs(v))}f", v)
    // A change in its price's decimals (EUR/USD's -0.0009, not -0.00093000)
    fun change(v: Double?, price: Double? = null): String =
        if (v == null) "" else (if (v > 0) "+" else "") + String.format(Locale.US, "%,.${decimals(abs(price ?: v))}f", v)
    fun pct(v: Double?): String = if (v == null) "" else String.format(Locale.US, "%s%.2f%%", if (v > 0) "+" else "", v)
    fun volume(v: Double?): String {
        if (v == null) return "—"
        return when {
            v >= 1e9 -> String.format(Locale.US, "%.2fB", v / 1e9)
            v >= 1e6 -> String.format(Locale.US, "%.2fM", v / 1e6)
            v >= 1e3 -> String.format(Locale.US, "%.2fK", v / 1e3)
            else -> String.format(Locale.US, "%.0f", v)
        }
    }
    fun intervalLabel(iv: String): String = when (iv) {
        "1min" -> "1m"; "3min" -> "3m"; "5min" -> "5m"; "15min" -> "15m"; "30min" -> "30m"; "45min" -> "45m"
        "1h" -> "1h"; "2h" -> "2h"; "3h" -> "3h"; "4h" -> "4h"; "1day" -> "1D"; "1week" -> "1W"; "1month" -> "1M"
        else -> iv
    }
}

fun changeColor(v: Double?, muted: Color): Color = when {
    v == null || v == 0.0 -> muted
    v > 0 -> Tp.up
    else -> Tp.down
}

// What kind of market a symbol is (the site's split: no "/" is a stock)
fun assetKind(sym: String): String {
    val s = sym.uppercase()
    if (!s.contains('/')) return "stock"
    val base = s.substringBefore('/')
    if (base in setOf("BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "BNB", "LTC", "DOT", "AVAX", "LINK", "TRX", "TON", "BCH")) return "crypto"
    if (base in setOf("XAU", "XAG", "XPT", "XPD", "WTI", "BRENT")) return "commodity"
    return "forex"
}

// A symbol's round badge: its letters on its market's colour (no copied company logos)
@Composable
fun SymbolBadge(symbol: String, size: Dp = 36.dp) {
    val kind = assetKind(symbol)
    val bg = when (kind) {
        "crypto" -> Color(0xFFF7931A); "commodity" -> Color(0xFFD4A017); "forex" -> Color(0xFF2E7D32); else -> Tp.purple
    }
    val letters = symbol.substringBefore('/').take(if (kind == "stock") 2 else 3)
    Box(Modifier.size(size).background(bg, CircleShape), contentAlignment = Alignment.Center) {
        Text(letters, color = Color.White, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.32f).sp, maxLines = 1)
    }
}
