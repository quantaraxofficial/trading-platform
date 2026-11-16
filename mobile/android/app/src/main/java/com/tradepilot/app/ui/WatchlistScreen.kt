package com.tradepilot.app.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tradepilot.app.bridge.Bridge
import com.tradepilot.app.bridge.Quote
import com.tradepilot.app.bridge.WlItem

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun WatchlistScreen(nav: Nav) {
    val tp = LocalTp.current
    val lists by Bridge.lists.collectAsStateWithLifecycle()
    val quotes by Bridge.quotes.collectAsStateWithLifecycle()
    val ready by Bridge.ready.collectAsStateWithLifecycle()
    var menu by remember { mutableStateOf(false) }
    var newList by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf<String?>(null) }
    val active = lists.active

    Column(Modifier.fillMaxSize().background(tp.page)) {
        // The list's name (switch lists, make one), search, add
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box {
                Row(Modifier.clip(RoundedCornerShape(8.dp)).background(tp.chip).clickable { menu = true }.padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(active?.name ?: "Watchlist", color = tp.text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1)
                    Icon(Icons.Outlined.KeyboardArrowDown, null, tint = tp.muted, modifier = Modifier.size(18.dp))
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, containerColor = tp.raised) {
                    for (l in lists.lists) {
                        DropdownMenuItem(
                            text = { Text(l.name, color = tp.text) },
                            trailingIcon = { if (l.id == active?.id) Icon(Icons.Outlined.Check, null, tint = Tp.purple) },
                            onClick = { menu = false; Bridge.send("openList", "id" to l.id) },
                        )
                    }
                    HorizontalDivider(color = tp.separator)
                    DropdownMenuItem(text = { Text("New list…", color = tp.text) }, leadingIcon = { Icon(Icons.Outlined.Add, null, tint = tp.text) }, onClick = { menu = false; newList = true })
                }
            }
            Spacer(Modifier.weight(1f))
            IconButton(onClick = { nav.open(Screen.Search(SearchFor.Chart)) }) { Icon(Icons.Outlined.Search, "Search", tint = tp.text) }
            IconButton(onClick = { nav.open(Screen.Search(SearchFor.Watchlist)) }) { Icon(Icons.Outlined.Add, "Add symbol", tint = tp.text) }
        }

        if (!ready && lists.lists.isEmpty()) {
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                CircularProgressIndicator(color = Tp.purple, strokeWidth = 2.dp, modifier = Modifier.size(26.dp))
                Spacer(Modifier.height(12.dp))
                Text("Connecting to your PC…", color = tp.muted, fontSize = 14.sp)
            }
            return@Column
        }
        val items = active?.items.orEmpty()
        if (items.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text("This list is empty", color = tp.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
                Text("Add the symbols you follow: their prices show here, live.", color = tp.muted, fontSize = 14.sp)
                Spacer(Modifier.height(16.dp))
                TextButton(onClick = { nav.open(Screen.Search(SearchFor.Watchlist)) }) { Text("Add symbol", color = Tp.purple, fontWeight = FontWeight.SemiBold) }
            }
            return@Column
        }

        // Sections fold away what's under them, as on TradingView
        val shown = buildList {
            var hidden = false
            for (it in items) {
                if (it is WlItem.Section) { hidden = it.collapsed; add(it) } else if (!hidden) add(it)
            }
        }
        LazyColumn(Modifier.fillMaxSize()) {
            items(shown, key = { if (it is WlItem.Section) "s:" + it.id else "y:" + (it as WlItem.Symbol).symbol }) { item ->
                when (item) {
                    is WlItem.Section -> Row(Modifier.fillMaxWidth().clickable { Bridge.send("toggleSection", "id" to item.id) }.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (item.collapsed) Icons.Outlined.KeyboardArrowRight else Icons.Outlined.KeyboardArrowDown, null, tint = tp.muted, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(item.name.lowercase().replaceFirstChar { it.uppercase() }, color = tp.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                    is WlItem.Symbol -> Column(Modifier.combinedClickable(onClick = { nav.open(Screen.Symbol(item.symbol)) }, onLongClick = { removing = item.symbol })) {
                        SymbolRow(item.symbol, quotes[item.symbol])
                        HorizontalDivider(color = tp.separator, thickness = 0.5.dp, modifier = Modifier.padding(start = 64.dp))
                    }
                }
            }
        }
    }

    if (newList) {
        var name by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { newList = false }, containerColor = tp.raised,
            title = { Text("New list", color = tp.text) },
            text = { OutlinedTextField(value = name, onValueChange = { name = it }, singleLine = true, placeholder = { Text("Name") }) },
            confirmButton = { TextButton(enabled = name.isNotBlank(), onClick = { Bridge.send("createList", "name" to name.trim()); newList = false }) { Text("Create", color = Tp.purple) } },
            dismissButton = { TextButton(onClick = { newList = false }) { Text("Cancel", color = tp.muted) } },
        )
    }
    removing?.let { sym ->
        AlertDialog(
            onDismissRequest = { removing = null }, containerColor = tp.raised,
            title = { Text(sym, color = tp.text) },
            text = { Text("Remove it from ${active?.name ?: "this list"}?", color = tp.muted) },
            confirmButton = { TextButton(onClick = { Bridge.send("removeSymbol", "symbol" to sym); removing = null }) { Text("Remove", color = Tp.down) } },
            dismissButton = { TextButton(onClick = { removing = null }) { Text("Cancel", color = tp.muted) } },
        )
    }
}

@Composable
fun SymbolRow(symbol: String, q: Quote?) {
    val tp = LocalTp.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
        SymbolBadge(symbol)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(symbol, color = tp.text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1)
            Text(q?.name?.ifBlank { null } ?: " ", color = tp.muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.width(10.dp))
        Column(horizontalAlignment = Alignment.End) {
            Text(Fmt.price(q?.last), color = tp.text, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 1)
            val c = changeColor(q?.change, tp.muted)
            Text(if (q == null) " " else "${Fmt.change(q.change, q.last)}  ${Fmt.pct(q.changePct)}", color = c, fontSize = 13.sp, maxLines = 1)
        }
    }
}
