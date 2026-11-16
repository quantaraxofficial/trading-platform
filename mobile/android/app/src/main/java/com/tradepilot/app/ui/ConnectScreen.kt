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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tradepilot.app.data.Connection
import com.tradepilot.app.data.Net
import kotlinx.coroutines.launch

// Which PC to connect to: the merge site runs on the user's PC (TradePilot's merge app, with
// "Use TradePilot on your phone" on), and the phone reaches it over the same Wi-Fi
@Composable
fun ConnectScreen(initial: Connection?, onDone: (Connection) -> Unit, onBack: (() -> Unit)?) {
    val tp = LocalTp.current
    val scope = rememberCoroutineScope()
    var host by remember { mutableStateOf(initial?.host ?: "") }
    var sitePort by remember { mutableStateOf((initial?.sitePort ?: 3007).toString()) }
    var backendPort by remember { mutableStateOf((initial?.backendPort ?: 8000).toString()) }
    var advanced by remember { mutableStateOf(false) }
    var checking by remember { mutableStateOf(false) }
    var site by remember { mutableStateOf<Boolean?>(null) }
    var backend by remember { mutableStateOf<Boolean?>(null) }

    fun connect() {
        val c = Connection(host.trim().removePrefix("http://").substringBefore('/').substringBefore(':'), sitePort.toIntOrNull() ?: 3007, backendPort.toIntOrNull() ?: 8000)
        if (c.host.isBlank()) return
        checking = true; site = null; backend = null
        scope.launch {
            val s = Net.status("${c.site}/")?.let { it in 200..399 } ?: false
            val b = Net.status("${c.backend}/admin/login/")?.let { it in 200..399 } ?: false
            site = s; backend = b; checking = false
            if (s && b) onDone(c)
        }
    }

    Column(Modifier.fillMaxSize().background(tp.page).imePadding().verticalScroll(rememberScrollState())) {
        if (onBack != null) IconButton(onClick = onBack, modifier = Modifier.padding(4.dp)) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back", tint = tp.text) }
        else Spacer(Modifier.height(48.dp))
        Column(Modifier.padding(horizontal = 24.dp)) {
            Box(Modifier.size(56.dp).clip(RoundedCornerShape(14.dp)).background(Brush.linearGradient(listOf(Color(0xFFA855F7), Color(0xFF6366F1)))), contentAlignment = Alignment.Center) {
                Text("TP", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp)
            }
            Spacer(Modifier.height(20.dp))
            Text("Connect to your PC", color = tp.text, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("TradePilot on your phone runs from TradePilot on your PC.", color = tp.muted, fontSize = 15.sp)
            Spacer(Modifier.height(20.dp))
            Step(1, "On your PC, open TradePilot (the merge edition).")
            Step(2, "Menu → Settings → Phone app: turn on \"Use TradePilot on your phone\" and restart it. Allow it on Private networks when Windows asks.")
            Step(3, "Keep your phone on the same Wi-Fi, and enter the address Settings shows (like 192.168.0.104).")
            Spacer(Modifier.height(18.dp))

            val fieldColors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Tp.purple, unfocusedBorderColor = tp.separator, focusedTextColor = tp.text, unfocusedTextColor = tp.text, cursorColor = Tp.purple, focusedLabelColor = Tp.purple, unfocusedLabelColor = tp.muted)
            OutlinedTextField(value = host, onValueChange = { host = it }, label = { Text("PC address") }, placeholder = { Text("192.168.0.104") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), colors = fieldColors, modifier = Modifier.fillMaxWidth())
            Text(if (advanced) "Hide ports" else "Ports…", color = Tp.purple, fontSize = 13.sp, modifier = Modifier.clickable { advanced = !advanced }.padding(vertical = 10.dp))
            if (advanced) Row {
                OutlinedTextField(value = sitePort, onValueChange = { sitePort = it.filter(Char::isDigit) }, label = { Text("Site") }, singleLine = true, colors = fieldColors, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(12.dp))
                OutlinedTextField(value = backendPort, onValueChange = { backendPort = it.filter(Char::isDigit) }, label = { Text("Backend") }, singleLine = true, colors = fieldColors, modifier = Modifier.weight(1f))
            }
            Spacer(Modifier.height(10.dp))
            if (site != null) {
                Check("The site (port $sitePort)", site == true)
                Check("The backend (port $backendPort)", backend == true)
                if (site != true || backend != true) Text("Check the address, that phone access is on and TradePilot restarted, and that the phone is on the PC's Wi-Fi.", color = tp.muted, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
                Spacer(Modifier.height(10.dp))
            }
            Button(onClick = { connect() }, enabled = host.isNotBlank() && !checking, modifier = Modifier.fillMaxWidth().height(50.dp), shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Tp.purple)) {
                if (checking) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                else Text("Connect", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun Step(n: Int, text: String) {
    val tp = LocalTp.current
    Row(Modifier.padding(vertical = 6.dp)) {
        Box(Modifier.size(24.dp).clip(RoundedCornerShape(12.dp)).background(tp.chip), contentAlignment = Alignment.Center) { Text("$n", color = tp.text, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
        Spacer(Modifier.width(12.dp))
        Text(text, color = tp.text, fontSize = 14.sp, lineHeight = 20.sp)
    }
}

@Composable
private fun Check(label: String, ok: Boolean) {
    val tp = LocalTp.current
    Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(if (ok) Icons.Outlined.CheckCircle else Icons.Outlined.ErrorOutline, null, tint = if (ok) Tp.up else Tp.down, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(label + if (ok) ": answering" else ": not answering", color = tp.text, fontSize = 14.sp)
    }
}
