package com.tradepilot.app.ui

import android.view.View
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ShowChart
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tradepilot.app.bridge.Bridge
import com.tradepilot.app.data.Connection
import com.tradepilot.app.data.Prefs
import com.tradepilot.app.web.Web

enum class Tab(val label: String, val icon: ImageVector) {
    Watchlist("Watchlist", Icons.Outlined.StarOutline),
    Chart("Chart", Icons.AutoMirrored.Outlined.ShowChart),
    Explore("Explore", Icons.Outlined.Explore),
    Community("Community", Icons.Outlined.Groups),
    Menu("Menu", Icons.Outlined.Menu),
}

enum class SearchFor { Watchlist, Chart }

sealed interface Screen {
    data class Search(val purpose: SearchFor) : Screen
    data class Symbol(val symbol: String) : Screen
    data class Page(val path: String, val title: String) : Screen
    data object Connect : Screen
    data object Guide : Screen
}

// What screens can ask of the app around them
class Nav(
    val open: (Screen) -> Unit,
    val back: () -> Unit,
    val tab: (Tab) -> Unit,
    // the chart: this symbol, in the Chart tab
    val chart: (String) -> Unit,
)

@Composable
fun TradePilotRoot() {
    val conn by Prefs.connection.collectAsStateWithLifecycle()
    val chart by Bridge.chart.collectAsStateWithLifecycle()
    TradePilotTheme(dark = chart.theme != "light") {
        val tp = LocalTp.current
        Surface(color = tp.page, modifier = Modifier.fillMaxSize()) {
            val c = conn
            var guide by remember { mutableStateOf(!Prefs.guideSeen) }
            when {
                c == null -> ConnectScreen(initial = null, onDone = { Prefs.saveConnection(it) }, onBack = null)
                guide -> GuideScreen(onDone = { Prefs.guideSeen = true; guide = false })
                else -> Main(c)
            }
        }
    }
}

@Composable
private fun Main(conn: Connection) {
    val ctx = LocalContext.current
    val tp = LocalTp.current
    var tab by rememberSaveable { mutableStateOf(Tab.Watchlist) }
    val stack = remember { mutableStateListOf<Screen>() }

    // The chart page: loaded once and kept (it's also where the watchlists and prices come from)
    val chartWeb = remember(conn) {
        Web.create(ctx, conn, chart = true).also {
            Bridge.webView = it
            it.loadUrl("${conn.site}/chart")
        }
    }
    DisposableEffect(chartWeb) {
        onDispose {
            if (Bridge.webView === chartWeb) Bridge.webView = null
            Bridge.pageGone()
            chartWeb.destroy()
        }
    }

    val nav = remember {
        Nav(
            open = { stack.add(it) },
            back = { if (stack.isNotEmpty()) stack.removeAt(stack.lastIndex) },
            tab = { stack.clear(); tab = it },
            chart = { s -> Bridge.setSymbol(s); Prefs.recentSymbols = listOf(s) + Prefs.recentSymbols.filter { it != s }; stack.clear(); tab = Tab.Chart },
        )
    }

    BackHandler(enabled = stack.isNotEmpty()) { nav.back() }
    BackHandler(enabled = stack.isEmpty() && tab != Tab.Watchlist) { tab = Tab.Watchlist }

    Box(Modifier.fillMaxSize().background(tp.page)) {
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f).statusBarsPadding()) {
                // (always there, under the other tabs: hidden, not unloaded)
                ChartTab(chartWeb, visible = tab == Tab.Chart, nav = nav)
                when (tab) {
                    Tab.Watchlist -> WatchlistScreen(nav)
                    Tab.Explore -> ExploreScreen(nav)
                    Tab.Community -> PageView(conn, "/community", title = null, onBack = null)
                    Tab.Menu -> MenuScreen(nav, conn)
                    Tab.Chart -> Unit
                }
            }
            HorizontalDivider(color = tp.separator, thickness = 0.5.dp)
            NavigationBar(
                containerColor = tp.page, tonalElevation = 0.dp,
                modifier = Modifier.windowInsetsPadding(WindowInsets.navigationBars),
                windowInsets = WindowInsets(0, 0, 0, 0),
            ) {
                for (t in Tab.entries) {
                    NavigationBarItem(
                        selected = tab == t,
                        onClick = { stack.clear(); tab = t },
                        icon = { Icon(t.icon, contentDescription = t.label) },
                        label = { Text(t.label, fontSize = 11.sp) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = tp.text, selectedTextColor = tp.text,
                            unselectedIconColor = tp.faint, unselectedTextColor = tp.faint,
                            indicatorColor = tp.chip,
                        ),
                    )
                }
            }
        }

        // Screens opened over the tabs (search, a symbol, a site page, the connection)
        stack.lastOrNull()?.let { s ->
            Box(Modifier.fillMaxSize().background(tp.page).statusBarsPadding().windowInsetsPadding(WindowInsets.navigationBars)) {
                when (s) {
                    is Screen.Search -> SearchScreen(s.purpose, nav)
                    is Screen.Symbol -> SymbolScreen(s.symbol, nav)
                    is Screen.Page -> PageView(conn, s.path, s.title, onBack = nav.back)
                    Screen.Connect -> ConnectScreen(initial = conn, onDone = { Prefs.saveConnection(it); nav.back() }, onBack = nav.back)
                    Screen.Guide -> GuideScreen(onDone = nav.back)
                }
            }
        }
    }
}

fun View.show(visible: Boolean) { visibility = if (visible) View.VISIBLE else View.INVISIBLE }
