package com.tradepilot.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tradepilot.app.bridge.Bridge
import com.tradepilot.app.data.Net
import com.tradepilot.app.data.Prefs
import kotlinx.coroutines.delay

private val POPULAR = listOf(
    Net.Hit("XAU/USD", "Gold Spot / US Dollar", "Physical Currency", "FOREX"),
    Net.Hit("EUR/USD", "Euro / US Dollar", "Physical Currency", "FOREX"),
    Net.Hit("GBP/USD", "British Pound / US Dollar", "Physical Currency", "FOREX"),
    Net.Hit("BTC/USD", "Bitcoin / US Dollar", "Digital Currency", "Coinbase Pro"),
    Net.Hit("ETH/USD", "Ethereum / US Dollar", "Digital Currency", "Coinbase Pro"),
    Net.Hit("AAPL", "Apple Inc.", "Common Stock", "NASDAQ"),
    Net.Hit("NVDA", "NVIDIA Corporation", "Common Stock", "NASDAQ"),
    Net.Hit("TSLA", "Tesla, Inc.", "Common Stock", "NASDAQ"),
)

@Composable
fun SearchScreen(purpose: SearchFor, nav: Nav) {
    val tp = LocalTp.current
    val conn by Prefs.connection.collectAsStateWithLifecycle()
    var q by remember { mutableStateOf("") }
    var hits by remember { mutableStateOf<List<Net.Hit>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }

    // (a moment after typing stops)
    LaunchedEffect(q) {
        if (q.isBlank()) { hits = null; busy = false; failed = false; return@LaunchedEffect }
        delay(300)
        busy = true
        val got = conn?.let { Net.search(it.site, q.trim()) }
        failed = got == null
        hits = got ?: emptyList()
        busy = false
    }

    fun pick(sym: String) {
        Prefs.recentSymbols = listOf(sym) + Prefs.recentSymbols.filter { it != sym }
        if (purpose == SearchFor.Watchlist) { Bridge.send("addSymbol", "symbol" to sym); nav.back() } else nav.chart(sym)
    }

    Column(Modifier.fillMaxSize().background(tp.page)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = nav.back) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back", tint = tp.text) }
            Row(Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(tp.chip).padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Search, null, tint = tp.muted, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                BasicTextField(
                    value = q, onValueChange = { q = it }, singleLine = true,
                    textStyle = TextStyle(color = tp.text, fontSize = 16.sp), cursorBrush = SolidColor(Tp.purple),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { hits?.firstOrNull()?.let { pick(it.symbol) } }),
                    modifier = Modifier.weight(1f).focusRequester(focus),
                    decorationBox = { inner -> if (q.isEmpty()) Text(if (purpose == SearchFor.Watchlist) "Add a symbol" else "Search", color = tp.faint, fontSize = 16.sp); inner() },
                )
                if (q.isNotEmpty()) Icon(Icons.Outlined.Close, "Clear", tint = tp.muted, modifier = Modifier.size(20.dp).clickable { q = "" })
            }
            Spacer(Modifier.width(8.dp))
        }
        if (busy) LinearProgressIndicator(color = Tp.purple, trackColor = tp.page, modifier = Modifier.fillMaxWidth())

        val list = hits
        LazyColumn(Modifier.fillMaxSize()) {
            if (list == null) {
                val recent = Prefs.recentSymbols
                if (recent.isNotEmpty()) {
                    item { Header("Recent") }
                    items(recent) { s -> HitRow(Net.Hit(s, "", "", ""), onClick = { pick(s) }) }
                }
                item { Header("Popular") }
                items(POPULAR) { h -> HitRow(h, onClick = { pick(h.symbol) }) }
            } else if (list.isEmpty() && !busy) {
                item { Text(if (failed) "Couldn't reach the site on your PC." else "Nothing found for \"$q\"", color = tp.muted, fontSize = 14.sp, modifier = Modifier.padding(24.dp)) }
            } else {
                items(list) { h -> HitRow(h, onClick = { pick(h.symbol) }) }
            }
        }
    }
}

@Composable
private fun Header(text: String) {
    val tp = LocalTp.current
    Text(text, color = tp.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 16.dp, top = 16.dp, bottom = 6.dp))
}

@Composable
private fun HitRow(h: Net.Hit, onClick: () -> Unit) {
    val tp = LocalTp.current
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        SymbolBadge(h.symbol, 32.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(h.symbol, color = tp.text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            if (h.name.isNotBlank()) Text(h.name, color = tp.muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (h.exchange.isNotBlank()) Text(h.exchange, color = tp.faint, fontSize = 12.sp, maxLines = 1)
    }
    HorizontalDivider(color = tp.separator, thickness = 0.5.dp, modifier = Modifier.padding(start = 60.dp))
}
