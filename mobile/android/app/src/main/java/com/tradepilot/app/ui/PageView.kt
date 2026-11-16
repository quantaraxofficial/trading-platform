package com.tradepilot.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.tradepilot.app.data.Connection
import com.tradepilot.app.web.Web

// A page of the merge site (community, analytics, sign-in…) in the app, signed in as the chart is
// (the app's WebViews share their storage)
@Composable
fun PageView(conn: Connection, path: String, title: String?, onBack: (() -> Unit)?) {
    val tp = LocalTp.current
    val ctx = LocalContext.current
    var pageTitle by remember { mutableStateOf(title ?: "") }
    var loading by remember { mutableStateOf(true) }
    val web = remember(conn, path) {
        Web.create(ctx, conn, chart = false, onTitle = { if (title == null) pageTitle = it }, onLoading = { loading = it })
            .also { it.loadUrl(conn.site + path) }
    }
    DisposableEffect(web) { onDispose { web.destroy() } }
    // back goes back in the page first
    BackHandler(enabled = onBack != null) { if (web.canGoBack()) web.goBack() else onBack?.invoke() }

    Column(Modifier.fillMaxSize()) {
        if (onBack != null || title != null) {
            Row(Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                if (onBack != null) IconButton(onClick = { if (web.canGoBack()) web.goBack() else onBack() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back", tint = tp.text) }
                Text(pageTitle, color = tp.text, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f).padding(start = if (onBack == null) 12.dp else 0.dp))
                IconButton(onClick = { web.reload() }) { Icon(Icons.Outlined.Refresh, "Reload", tint = tp.muted) }
            }
            HorizontalDivider(color = tp.separator, thickness = 0.5.dp)
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            AndroidView(factory = { web }, modifier = Modifier.fillMaxSize())
            if (loading) LinearProgressIndicator(color = Tp.purple, trackColor = tp.page, modifier = Modifier.fillMaxWidth())
        }
    }
}
