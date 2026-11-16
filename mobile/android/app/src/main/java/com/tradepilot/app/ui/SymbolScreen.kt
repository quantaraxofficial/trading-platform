package com.tradepilot.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tradepilot.app.bridge.Bar
import com.tradepilot.app.bridge.Bridge
import java.util.Calendar
import java.util.TimeZone

// TradingView's ranges, each from a timeframe that gives it enough points
private enum class Range(val label: String, val interval: String, val days: Int) {
    D1("1D", "5min", 1), D5("5D", "30min", 5), M1("1M", "2h", 31), M3("3M", "1day", 92),
    M6("6M", "1day", 183), YTD("YTD", "1day", -1), Y1("1Y", "1day", 366), Y5("5Y", "1week", 1830), ALL("All", "1month", 0),
}

@Composable
fun SymbolScreen(symbol: String, nav: Nav) {
    val tp = LocalTp.current
    val quotes by Bridge.quotes.collectAsStateWithLifecycle()
    val lists by Bridge.lists.collectAsStateWithLifecycle()
    val q = quotes[symbol]
    val inList = lists.active?.symbols?.contains(symbol) == true
    var range by remember { mutableStateOf(Range.D1) }
    var bars by remember { mutableStateOf<List<Bar>?>(null) }
    var daily by remember { mutableStateOf<List<Bar>?>(null) }

    LaunchedEffect(symbol, range) {
        bars = null
        val all = Bridge.series(symbol, range.interval).orEmpty()
        bars = cut(all, range)
    }
    // (a symbol that isn't in the list has no quote: its day from daily bars)
    LaunchedEffect(symbol) { if (Bridge.quotes.value[symbol] == null) daily = Bridge.series(symbol, "1day") }
    val last = q?.last ?: daily?.lastOrNull()?.c
    val prev = q?.prevClose ?: daily?.getOrNull((daily?.size ?: 0) - 2)?.c
    val change = q?.change ?: if (last != null && prev != null) last - prev else null
    val pct = q?.changePct ?: if (change != null && prev != null && prev != 0.0) change / prev * 100 else null

    Column(Modifier.fillMaxSize().background(tp.page)) {
        Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = nav.back) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back", tint = tp.text) }
            Spacer(Modifier.weight(1f))
            IconButton(onClick = { Bridge.send(if (inList) "removeSymbol" else "addSymbol", "symbol" to symbol) }) {
                Icon(if (inList) Icons.Outlined.Star else Icons.Outlined.StarOutline, if (inList) "In your watchlist" else "Add to watchlist", tint = if (inList) Color(0xFFF7C948) else tp.text)
            }
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                SymbolBadge(symbol, 40.dp)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(q?.name?.ifBlank { null } ?: symbol, color = tp.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    Text(listOfNotNull(symbol, q?.exchange?.ifBlank { null }).joinToString(" · "), color = tp.muted, fontSize = 13.sp)
                }
            }
            Spacer(Modifier.height(14.dp))
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.Bottom) {
                Text(Fmt.price(last), color = tp.text, fontSize = 34.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(6.dp))
                Text(q?.currency.orEmpty(), color = tp.muted, fontSize = 14.sp, modifier = Modifier.padding(bottom = 6.dp))
            }
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("${Fmt.change(change, last)}  ${Fmt.pct(pct)}", color = changeColor(change, tp.muted), fontSize = 15.sp, fontWeight = FontWeight.Medium)
                Spacer(Modifier.width(8.dp))
                Text(if (q?.marketOpen == true) "market open" else "at close", color = tp.muted, fontSize = 13.sp)
            }

            // The range's chart
            Box(Modifier.fillMaxWidth().height(240.dp).padding(top = 12.dp), contentAlignment = Alignment.Center) {
                val b = bars
                when {
                    b == null -> CircularProgressIndicator(color = Tp.purple, strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
                    b.size < 2 -> Text("No data for this range", color = tp.muted, fontSize = 13.sp)
                    else -> AreaChart(b)
                }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                for (r in Range.entries) {
                    val on = r == range
                    Text(r.label, color = if (on) tp.text else tp.muted, fontSize = 13.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(if (on) tp.chip else Color.Transparent).clickable { range = r }.padding(horizontal = 9.dp, vertical = 7.dp))
                }
            }

            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = { nav.chart(symbol) }, modifier = Modifier.weight(1f).height(46.dp), shape = RoundedCornerShape(10.dp)) {
                    Text("Chart", color = tp.text, fontWeight = FontWeight.SemiBold)
                }
                Button(onClick = { nav.chart(symbol); Bridge.send("trade") }, modifier = Modifier.weight(1f).height(46.dp), shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Tp.purple)) {
                    Text("Trade", color = Color.White, fontWeight = FontWeight.SemiBold)
                }
            }

            Text("Key stats", color = tp.text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, modifier = Modifier.padding(start = 16.dp, top = 8.dp, bottom = 4.dp))
            val day = daily?.lastOrNull()
            Stat("Open", Fmt.price(q?.open ?: day?.o))
            Stat("Day's high", Fmt.price(q?.high ?: day?.h))
            Stat("Day's low", Fmt.price(q?.low ?: day?.l))
            Stat("Previous close", Fmt.price(prev))
            if (q?.volume != null && q.volume > 0) Stat("Volume", Fmt.volume(q.volume))
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun Stat(label: String, value: String) {
    val tp = LocalTp.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 11.dp)) {
        Text(label, color = tp.muted, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Text(value, color = tp.text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
    HorizontalDivider(color = tp.separator, thickness = 0.5.dp, modifier = Modifier.padding(horizontal = 16.dp))
}

private fun cut(all: List<Bar>, r: Range): List<Bar> {
    if (all.isEmpty() || r.days == 0) return all
    val end = all.last().t
    val from = if (r.days < 0) {
        val c = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { timeInMillis = end * 1000; set(Calendar.DAY_OF_YEAR, 1); set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0) }
        c.timeInMillis / 1000
    } else end - r.days * 86400L
    return all.filter { it.t >= from }
}

// TradingView's symbol-page chart: a line over a fading fill, green when the range rose, red when it
// fell, the range's first price dotted across
@Composable
private fun AreaChart(bars: List<Bar>) {
    val tp = LocalTp.current
    val up = bars.last().c >= bars.first().c
    val line = if (up) Tp.up else Tp.down
    Canvas(Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 8.dp)) {
        val lo = bars.minOf { it.c }; val hi = bars.maxOf { it.c }
        val span = (hi - lo).takeIf { it > 0 } ?: 1.0
        fun x(i: Int) = i * size.width / (bars.size - 1)
        fun y(v: Double) = (size.height * (1 - (v - lo) / span)).toFloat()
        val path = Path()
        bars.forEachIndexed { i, b -> if (i == 0) path.moveTo(x(i), y(b.c)) else path.lineTo(x(i), y(b.c)) }
        val fill = Path().apply { addPath(path); lineTo(size.width, size.height); lineTo(0f, size.height); close() }
        drawPath(fill, Brush.verticalGradient(listOf(line.copy(alpha = 0.28f), line.copy(alpha = 0f))))
        drawPath(path, line, style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round))
        val y0 = y(bars.first().c)
        drawLine(tp.faint, Offset(0f, y0), Offset(size.width, y0), strokeWidth = 1f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)))
    }
}
