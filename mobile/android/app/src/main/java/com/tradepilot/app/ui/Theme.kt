package com.tradepilot.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// TradingView's app colours (black / white pages, grey separators, its green and red) with
// TradePilot's purple where TradingView has its blue
object Tp {
    val purple = Color(0xFF7C3AED)
    val purpleLight = Color(0xFFA78BFA)
    val up = Color(0xFF089981)
    val down = Color(0xFFF23645)
}

data class TpColors(
    val page: Color, val surface: Color, val raised: Color, val text: Color, val muted: Color,
    val faint: Color, val separator: Color, val chip: Color, val dark: Boolean,
)

val DarkTp = TpColors(Color(0xFF000000), Color(0xFF0F0F0F), Color(0xFF1E1E1E), Color(0xFFDBDBDB), Color(0xFF8C8C8C), Color(0xFF5C5C5C), Color(0xFF2E2E2E), Color(0xFF2A2A2A), true)
val LightTp = TpColors(Color(0xFFFFFFFF), Color(0xFFF7F7F8), Color(0xFFFFFFFF), Color(0xFF131722), Color(0xFF6A6D78), Color(0xFFA3A6AF), Color(0xFFE0E3EB), Color(0xFFF0F3FA), false)

val LocalTp = staticCompositionLocalOf { DarkTp }

@Composable
fun TradePilotTheme(dark: Boolean, content: @Composable () -> Unit) {
    val tp = if (dark) DarkTp else LightTp
    val scheme = if (dark) darkColorScheme(
        primary = Tp.purple, onPrimary = Color.White, secondary = Tp.purpleLight,
        background = tp.page, surface = tp.page, surfaceVariant = tp.raised, onBackground = tp.text, onSurface = tp.text,
        onSurfaceVariant = tp.muted, outline = tp.separator, surfaceContainer = tp.raised, surfaceContainerHigh = tp.raised,
    ) else lightColorScheme(
        primary = Tp.purple, onPrimary = Color.White, secondary = Tp.purpleLight,
        background = tp.page, surface = tp.page, surfaceVariant = tp.chip, onBackground = tp.text, onSurface = tp.text,
        onSurfaceVariant = tp.muted, outline = tp.separator, surfaceContainer = tp.raised, surfaceContainerHigh = tp.raised,
    )
    CompositionLocalProvider(LocalTp provides tp) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
