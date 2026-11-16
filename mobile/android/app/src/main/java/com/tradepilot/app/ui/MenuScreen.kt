package com.tradepilot.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.Analytics
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.SwapVert
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tradepilot.app.BuildConfig
import com.tradepilot.app.bridge.Bridge
import com.tradepilot.app.data.Connection

@Composable
fun MenuScreen(nav: Nav, conn: Connection) {
    val tp = LocalTp.current
    val user by Bridge.user.collectAsStateWithLifecycle()
    val chart by Bridge.chart.collectAsStateWithLifecycle()
    var about by remember { mutableStateOf(false) }
    val dark = chart.theme != "light"

    Column(Modifier.fillMaxSize().background(tp.page).verticalScroll(rememberScrollState())) {
        // Who's signed in (or sign in)
        Row(Modifier.fillMaxWidth().clickable { if (!user.signedIn) nav.open(Screen.Page("/login", "Sign in")) else nav.open(Screen.Page("/profile", "Profile")) }.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(52.dp).clip(CircleShape).background(Brush.linearGradient(listOf(Color(0xFFA855F7), Color(0xFF6366F1)))), contentAlignment = Alignment.Center) {
                if (user.signedIn) Text((user.name.ifBlank { user.email }).take(1).uppercase(), color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                else Icon(Icons.Outlined.Person, null, tint = Color.White)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(if (user.signedIn) user.name.ifBlank { user.email } else "Sign in", color = tp.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Text(if (user.signedIn) user.email else "Your watchlists, layouts and trades on every device", color = tp.muted, fontSize = 13.sp)
            }
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = tp.faint)
        }
        Divider()

        Group("Trading")
        Item(Icons.Outlined.Notifications, "Alerts") { nav.tab(Tab.Chart); Bridge.send("alerts") }
        Item(Icons.Outlined.SwapVert, "Paper trading") { nav.tab(Tab.Chart); Bridge.send("trade") }
        Item(Icons.Outlined.Code, "Pine Editor") { nav.tab(Tab.Chart); Bridge.send("pine") }
        Item(Icons.Outlined.Analytics, "Analytics and backtests") { nav.open(Screen.Page("/analytics", "Analytics")) }
        Divider()

        Group("App")
        Item(if (dark) Icons.Outlined.LightMode else Icons.Outlined.DarkMode, if (dark) "Light theme" else "Dark theme") { Bridge.send("theme", "theme" to if (dark) "light" else "dark") }
        Item(Icons.Outlined.Settings, "Chart settings") { nav.tab(Tab.Chart); Bridge.send("settings") }
        Item(Icons.Outlined.Wifi, "Your PC", conn.host) { nav.open(Screen.Connect) }
        Item(Icons.AutoMirrored.Outlined.MenuBook, "Guide") { nav.open(Screen.Guide) }
        Item(Icons.Outlined.Info, "About") { about = true }
        if (user.signedIn) {
            Divider()
            Item(Icons.AutoMirrored.Outlined.Logout, "Sign out", tint = Tp.down) { Bridge.send("logout") }
        }
        Spacer(Modifier.height(24.dp))
    }

    if (about) AlertDialog(
        onDismissRequest = { about = false }, containerColor = tp.raised,
        title = { Text("TradePilot", color = tp.text) },
        text = { Text("Version ${BuildConfig.VERSION_NAME}\nThe merge edition, on your PC at ${conn.site}.", color = tp.muted) },
        confirmButton = { TextButton(onClick = { about = false }) { Text("OK", color = Tp.purple) } },
    )
}

@Composable
private fun Divider() {
    val tp = LocalTp.current
    HorizontalDivider(color = tp.separator, thickness = 0.5.dp)
}

@Composable
private fun Group(text: String) {
    val tp = LocalTp.current
    Text(text, color = tp.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 16.dp, top = 16.dp, bottom = 4.dp))
}

@Composable
private fun Item(icon: ImageVector, label: String, detail: String? = null, tint: Color? = null, onClick: () -> Unit) {
    val tp = LocalTp.current
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = tint ?: tp.text, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(16.dp))
        Text(label, color = tint ?: tp.text, fontSize = 16.sp, modifier = Modifier.weight(1f))
        if (detail != null) Text(detail, color = tp.muted, fontSize = 13.sp)
    }
}

@Suppress("unused")
private val corner = RoundedCornerShape(8.dp)
