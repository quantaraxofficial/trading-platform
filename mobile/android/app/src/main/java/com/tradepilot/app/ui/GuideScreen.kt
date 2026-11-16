package com.tradepilot.app.ui

import androidx.compose.foundation.background
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
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ShowChart
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

private class Page(val icon: ImageVector, val title: String, val text: String)

private val PAGES = listOf(
    Page(Icons.Outlined.StarOutline, "Your watchlist", "The lists you keep on your PC, with live prices. Tap a symbol for its page, hold it to remove it, + to add one."),
    Page(Icons.AutoMirrored.Outlined.ShowChart, "The chart, as on your PC", "Your layouts, indicators and drawings. The bar under it changes the symbol and timeframe, opens the drawing tools, indicators and everything else."),
    Page(Icons.Outlined.Explore, "Everything TradePilot does", "Explore has analytics, bar replay, paper trading, Pine, the leaderboard and more. Menu has your account, theme and your PC's address."),
)

// The app's first-run guide (the site's guided tours, for the phone): once, and again from Menu → Guide
@Composable
fun GuideScreen(onDone: () -> Unit) {
    val tp = LocalTp.current
    val pager = rememberPagerState { PAGES.size }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().background(tp.page).padding(24.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = onDone) { Text("Skip", color = tp.muted) }
        }
        HorizontalPager(state = pager, modifier = Modifier.weight(1f)) { i ->
            val p = PAGES[i]
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Box(Modifier.size(96.dp).clip(RoundedCornerShape(26.dp)).background(Brush.linearGradient(listOf(Color(0xFFA855F7), Color(0xFF6366F1)))), contentAlignment = Alignment.Center) {
                    Icon(p.icon, null, tint = Color.White, modifier = Modifier.size(46.dp))
                }
                Spacer(Modifier.height(32.dp))
                Text(p.title, color = tp.text, fontSize = 24.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                Spacer(Modifier.height(12.dp))
                Text(p.text, color = tp.muted, fontSize = 15.sp, lineHeight = 22.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 8.dp))
            }
        }
        Row(Modifier.fillMaxWidth().padding(vertical = 18.dp), horizontalArrangement = Arrangement.Center) {
            repeat(PAGES.size) { i ->
                Box(Modifier.padding(4.dp).size(if (i == pager.currentPage) 22.dp else 8.dp, 8.dp).clip(CircleShape).background(if (i == pager.currentPage) Tp.purple else tp.chip))
            }
        }
        val last = pager.currentPage == PAGES.lastIndex
        Button(onClick = { if (last) onDone() else scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } },
            modifier = Modifier.fillMaxWidth().height(50.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = Tp.purple)) {
            Text(if (last) "Start" else "Next", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        }
        Spacer(Modifier.width(1.dp))
    }
}
