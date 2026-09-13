/*
 * RSVP Reader - Copyright (C) 2026 Osman Sahin Guler
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package io.github.hawkosm.rsvpreader

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// The same palette as the desktop app (ui/style.py).
val Bg = Color(0xFF16181D)
val Raised = Color(0xFF1E2128)
val Hover = Color(0xFF272B34)
val BorderCol = Color(0xFF32373F)
val TextCol = Color(0xFFE6E8EC)
val DimCol = Color(0xFF8C93A0)
val Accent = Color(0xFFFF5A5F)
val Guide = Color(0xFF3A404A)

@Composable
fun RsvpTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Accent,
            onPrimary = Color(0xFF14161A),
            background = Bg,
            onBackground = TextCol,
            surface = Raised,
            onSurface = TextCol,
            surfaceVariant = Hover,
            onSurfaceVariant = DimCol,
            outline = BorderCol,
        ),
        content = content,
    )
}
