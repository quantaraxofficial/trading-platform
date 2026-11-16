package com.tradepilot.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.outlined.Analytics
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.OndemandVideo
import androidx.compose.material.icons.outlined.SwapVert
import androidx.compose.material.icons.outlined.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tradepilot.app.bridge.Bridge

private class Feature(val icon: ImageVector, val title: String, val text: String, val tint: Color, val go: (Nav) -> Unit)

// TradePilot's own features (and the chart's tools), each one tap away
private val FEATURES = listOf(
    Feature(Icons.Outlined.Analytics, "Analytics", "Your trading journal and backtest sessions", Color(0xFF7C3AED)) { it.open(Screen.Page("/analytics", "Analytics")) },
    Feature(Icons.Outlined.History, "Bar replay", "Trade the past, bar by bar", Color(0xFF2E7D32)) { it.tab(Tab.Chart); Bridge.send("replay") },
    Feature(Icons.Outlined.SwapVert, "Paper trading", "Orders and positions on the chart", Color(0xFF089981)) { it.tab(Tab.Chart); Bridge.send("trade") },
    Feature(Icons.Outlined.Code, "Pine Editor", "Write and run strategies", Color(0xFF0277BD)) { it.tab(Tab.Chart); Bridge.send("pine") },
    Feature(Icons.Outlined.Notifications, "Alerts", "Price and indicator alerts", Color(0xFFEF6C00)) { it.tab(Tab.Chart); Bridge.send("alerts") },
    Feature(Icons.Outlined.EmojiEvents, "Leaderboard", "The traders on top", Color(0xFFD4A017)) { it.open(Screen.Page("/leaderboard", "Leaderboard")) },
    Feature(Icons.Outlined.OndemandVideo, "Reels", "Short trading videos", Color(0xFFE91E63)) { it.open(Screen.Page("/reels", "Reels")) },
    Feature(Icons.Outlined.WorkspacePremium, "Plans", "What each plan includes", Color(0xFF6366F1)) { it.open(Screen.Page("/pricing", "Plans")) },
    Feature(Icons.AutoMirrored.Outlined.HelpOutline, "Q&A", "Answers about TradePilot", Color(0xFF546E7A)) { it.open(Screen.Page("/faq", "Q&A")) },
)

@Composable
fun ExploreScreen(nav: Nav) {
    val tp = LocalTp.current
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.fillMaxSize().background(tp.page),
        contentPadding = PaddingValues(14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(span = { GridItemSpan(2) }) {
            Text("Explore", color = tp.text, fontSize = 26.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 4.dp, start = 2.dp))
        }
        items(FEATURES) { f ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(tp.raised).clickable { f.go(nav) }.padding(14.dp)) {
                Box(Modifier.size(38.dp).clip(RoundedCornerShape(10.dp)).background(Brush.linearGradient(listOf(f.tint, f.tint.copy(alpha = 0.7f)))), contentAlignment = androidx.compose.ui.Alignment.Center) {
                    Icon(f.icon, null, tint = Color.White, modifier = Modifier.size(22.dp))
                }
                Spacer(Modifier.height(12.dp))
                Text(f.title, color = tp.text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                Spacer(Modifier.height(2.dp))
                Text(f.text, color = tp.muted, fontSize = 12.sp, lineHeight = 16.sp, minLines = 2, maxLines = 2)
            }
        }
    }
}
