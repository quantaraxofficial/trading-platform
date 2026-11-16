package com.tradepilot.app.ui

import android.webkit.WebView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Redo
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.AccountTree
import androidx.compose.material.icons.outlined.AddAlert
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.Draw
import androidx.compose.material.icons.outlined.Functions
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.SwapVert
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tradepilot.app.bridge.Bridge
import kotlinx.coroutines.delay

// The timeframes the site's data covers on every market
private val INTERVALS = listOf("1min", "5min", "15min", "30min", "45min", "1h", "2h", "4h", "1day", "1week", "1month")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChartTab(web: WebView, visible: Boolean, nav: Nav) {
    val tp = LocalTp.current
    val state by Bridge.chart.collectAsStateWithLifecycle()
    val ready by Bridge.ready.collectAsStateWithLifecycle()
    var sheet by remember { mutableStateOf<String?>(null) }
    // (no answer from the page for a while: say what to check)
    var slow by remember { mutableStateOf(false) }
    LaunchedEffect(ready) { slow = false; if (!ready) { delay(20_000); slow = true } }

    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f).fillMaxWidth()) {
            AndroidView(factory = { web }, update = { it.show(visible) }, modifier = Modifier.fillMaxSize())
            if (visible && !ready) {
                Column(Modifier.fillMaxSize().background(tp.page), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    CircularProgressIndicator(color = Tp.purple, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
                    Spacer(Modifier.height(14.dp))
                    Text(if (slow) "Still connecting to your PC…" else "Opening the chart…", color = tp.muted, fontSize = 14.sp)
                    if (slow) {
                        Text("Check that TradePilot is open on your PC with \"Use TradePilot on your phone\" on, and that both are on the same Wi-Fi.",
                            color = tp.faint, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 32.dp, vertical = 8.dp))
                        Text("Reload", color = Tp.purple, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { web.reload() }.padding(10.dp))
                    }
                }
            }
        }
        if (visible) {
            HorizontalDivider(color = tp.separator, thickness = 0.5.dp)
            // TradingView's chart bar: symbol, timeframe | drawing, indicators, more | undo, redo
            Row(Modifier.fillMaxWidth().height(48.dp).background(tp.page).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(state.symbol.ifEmpty { "—" }, color = tp.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable { nav.open(Screen.Search(SearchFor.Chart)) }.padding(horizontal = 10.dp, vertical = 8.dp).width(84.dp))
                Text(Fmt.intervalLabel(state.interval).ifEmpty { "—" }, color = tp.text, fontSize = 14.sp,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable { sheet = "interval" }.padding(horizontal = 10.dp, vertical = 8.dp))
                Spacer(Modifier.weight(1f))
                BarIcon(Icons.Outlined.Draw, "Drawing tools", active = state.draw) { Bridge.send("draw") }
                BarIcon(Icons.Outlined.Functions, "Indicators") { Bridge.send("indicators") }
                BarIcon(Icons.Outlined.MoreHoriz, "More") { sheet = "more" }
                VerticalDivider(color = tp.separator, modifier = Modifier.height(22.dp).padding(horizontal = 2.dp))
                BarIcon(Icons.AutoMirrored.Outlined.Undo, "Undo") { Bridge.send("undo") }
                BarIcon(Icons.AutoMirrored.Outlined.Redo, "Redo") { Bridge.send("redo") }
            }
        }
    }

    if (sheet != null) {
        val ss = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { sheet = null }, sheetState = ss, containerColor = tp.raised) {
            if (sheet == "interval") IntervalSheet(state.interval) { Bridge.setInterval(it); sheet = null }
            else MoreSheet(state.theme, state.bottom) { sheet = null }
        }
    }
}

@Composable
private fun BarIcon(icon: ImageVector, label: String, active: Boolean = false, onClick: () -> Unit) {
    val tp = LocalTp.current
    IconButton(onClick = onClick, modifier = Modifier.size(42.dp)) {
        Icon(icon, contentDescription = label, tint = if (active) Tp.purple else tp.text, modifier = Modifier.size(22.dp))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun IntervalSheet(current: String, pick: (String) -> Unit) {
    val tp = LocalTp.current
    Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp)) {
        Text("Timeframe", color = tp.text, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, modifier = Modifier.padding(bottom = 14.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            for (iv in INTERVALS) {
                val on = iv == current
                Box(Modifier.clip(RoundedCornerShape(8.dp)).background(if (on) Tp.purple else tp.chip).clickable { pick(iv) }.padding(horizontal = 16.dp, vertical = 10.dp)) {
                    Text(Fmt.intervalLabel(iv), color = if (on) androidx.compose.ui.graphics.Color.White else tp.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

@Composable
private fun MoreSheet(theme: String, bottomOpen: Boolean, close: () -> Unit) {
    val tp = LocalTp.current
    fun go(type: String, vararg f: Pair<String, Any?>) { Bridge.send(type, *f); close() }
    Column(Modifier.padding(bottom = 24.dp)) {
        SheetRow(Icons.Outlined.Notifications, "Alerts") { go("alerts") }
        SheetRow(Icons.Outlined.AddAlert, "Create alert") { go("createAlert") }
        SheetRow(Icons.Outlined.History, "Bar replay") { go("replay") }
        SheetRow(Icons.Outlined.SwapVert, if (bottomOpen) "Hide trading panel" else "Trading panel") { go(if (bottomOpen) "bottom" else "trade", "open" to !bottomOpen) }
        SheetRow(Icons.Outlined.Code, "Pine Editor") { go("pine") }
        SheetRow(Icons.Outlined.AccountTree, "Object tree") { go("objectTree") }
        SheetRow(Icons.Outlined.CameraAlt, "Snapshot") { go("snapshot") }
        SheetRow(Icons.Outlined.Settings, "Chart settings") { go("settings") }
        HorizontalDivider(color = tp.separator, modifier = Modifier.padding(vertical = 6.dp))
        val dark = theme != "light"
        SheetRow(if (dark) Icons.Outlined.LightMode else Icons.Outlined.DarkMode, if (dark) "Light theme" else "Dark theme") { go("theme", "theme" to if (dark) "light" else "dark") }
    }
}

@Composable
fun SheetRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    val tp = LocalTp.current
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 22.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = tp.text, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(18.dp))
        Text(label, color = tp.text, fontSize = 16.sp)
    }
}
