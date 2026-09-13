/*
 * RSVP Reader - Copyright (C) 2026 Osman Sahin Guler
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package io.github.hawkosm.rsvpreader

import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb

/** Where the ORP letter is pinned, as a fraction of the width. */
private const val FOCUS_X_RATIO = 0.42f

/**
 * Draws one word with its ORP letter on a fixed pixel.
 *
 * The same approach as the desktop's RsvpDisplay: measure the characters
 * before the focus letter and shift the whole word left by that much plus
 * half the letter, so the letter never moves between words.  Paint
 * .measureText stands in for QFontMetrics.
 */
@Composable
fun WordCanvas(word: String, modifier: Modifier = Modifier) {
    val paint = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
        }
    }
    val guidePaint = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Guide.toArgb()
            strokeWidth = 4f
        }
    }

    Canvas(modifier) {
        val focusX = size.width * FOCUS_X_RATIO
        val centreY = size.height / 2f
        val base = minOf(size.width * 0.13f, size.height * 0.22f, 150f)

        drawContext.canvas.nativeCanvas.apply {
            drawLine(focusX, centreY - base * 0.95f, focusX, centreY - base * 0.6f, guidePaint)
            drawLine(focusX, centreY + base * 0.6f, focusX, centreY + base * 0.95f, guidePaint)

            if (word.isEmpty()) return@Canvas
            val orp = Rsvp.orpIndex(word)
            val prefix = word.substring(0, orp)
            val letter = word.substring(orp, orp + 1)
            val suffix = word.substring(orp + 1)

            // Shrink oversized words, checking each side of the focus point
            // separately because the word is pinned, not centred.
            var textSize = base
            repeat(3) {
                paint.textSize = textSize
                val half = paint.measureText(letter) / 2f
                val needLeft = paint.measureText(prefix) + half
                val needRight = half + paint.measureText(suffix)
                val scale = minOf(
                    1f,
                    (focusX - 12f) / maxOf(needLeft, 0.01f),
                    (size.width - focusX - 12f) / maxOf(needRight, 0.01f),
                )
                if (scale >= 0.999f) return@repeat
                textSize = maxOf(24f, textSize * scale)
            }
            paint.textSize = textSize

            val metrics = paint.fontMetrics
            val baseline = centreY - (metrics.ascent + metrics.descent) / 2f
            var x = focusX - paint.measureText(prefix) - paint.measureText(letter) / 2f

            paint.color = TextCol.toArgb()
            drawText(prefix, x, baseline, paint)
            x += paint.measureText(prefix)
            paint.color = Accent.toArgb()
            drawText(letter, x, baseline, paint)
            x += paint.measureText(letter)
            paint.color = TextCol.toArgb()
            drawText(suffix, x, baseline, paint)
        }
    }
}
