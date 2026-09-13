/*
 * RSVP Reader - Copyright (C) 2026 Osman Sahin Guler
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package io.github.hawkosm.rsvpreader

import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private const val MARGIN_DP = 20
private const val TEXT_SP = 18

/**
 * Reading a text file normally: a screenful of words at a time.
 *
 * The desktop offers a two-page spread here; a phone gets one page, which
 * is the same idea at the size available.  Tapping a word starts RSVP from
 * it, so you can read by eye for a while and then hand back over.
 */
@Composable
fun ReflowView(vm: ReaderViewModel, modifier: Modifier = Modifier) {
    val density = LocalDensity.current
    val margin = with(density) { MARGIN_DP.dp.toPx() }
    val paint = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.SERIF, Typeface.NORMAL)
            textSize = with(density) { TEXT_SP.sp.toPx() }
        }
    }

    var size by remember { mutableStateOf(IntPair(0, 0)) }
    // Re-laying out is only needed when the text or the space changes.
    val layout = remember(vm.tokens, size) {
        ReflowLayout.paginate(
            vm.tokens, paint,
            columnWidth = size.width - 2 * margin,
            usableHeight = size.height - 2 * margin,
        )
    }
    // The page follows the word being read, wherever that came from.
    val page = remember(layout, vm.index) { layout.pageOf(vm.index) }

    Column(modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().background(Bg).padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val canBack = page > 0
            val canOn = page < layout.pageCount - 1
            TextButton({ vm.seek(layout.firstIndexOf(page - 1)) }, enabled = canBack) {
                Text("‹", fontSize = 22.sp, color = if (canBack) TextCol else BorderCol)
            }
            Text(
                if (layout.pageCount > 0) "page ${page + 1} / ${layout.pageCount}" else "—",
                color = DimCol, textAlign = TextAlign.Center, modifier = Modifier.weight(1f),
            )
            TextButton({ vm.seek(layout.firstIndexOf(page + 1)) }, enabled = canOn) {
                Text("›", fontSize = 22.sp, color = if (canOn) TextCol else BorderCol)
            }
        }

        Canvas(
            Modifier.weight(1f).fillMaxWidth()
                .onSizeChangedPx { size = it }
                .pointerInput(layout, page) {
                    detectTapGestures { offset ->
                        wordAt(layout, page, offset.x, offset.y, margin, paint)
                            ?.let { vm.seek(it) }
                    }
                }
        ) {
            drawContext.canvas.nativeCanvas.apply {
                val lines = layout.pages.getOrNull(page) ?: return@apply
                var y = margin - paint.ascent()
                for (line in lines) {
                    for (word in line) {
                        val x = margin + word.x
                        if (word.index == vm.index) {
                            paint.color = Accent.toArgb()
                        } else {
                            paint.color = TextCol.toArgb()
                        }
                        drawText(word.text, x, y, paint)
                    }
                    y += layout.lineHeight
                }
            }
        }

        Text(
            "tap a word to read from there",
            color = DimCol, fontSize = 12.sp, textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().background(Bg).padding(vertical = 4.dp),
        )
    }
}

/** Which word sits under a tap, if any. */
private fun wordAt(
    layout: ReflowLayout,
    page: Int,
    tapX: Float,
    tapY: Float,
    margin: Float,
    paint: Paint,
): Int? {
    val lines = layout.pages.getOrNull(page) ?: return null
    val row = ((tapY - margin) / layout.lineHeight).toInt()
    val line = lines.getOrNull(row) ?: return null
    var best: Int? = null
    for (word in line) {
        val left = margin + word.x
        val right = left + paint.measureText(word.text)
        if (tapX >= left - 4f && tapX <= right + 4f) return word.index
        if (tapX > right) best = word.index      // fall back to the last word passed
    }
    return best
}

private data class IntPair(val width: Float, val height: Float)

private fun Modifier.onSizeChangedPx(onChange: (IntPair) -> Unit): Modifier =
    this.then(
        androidx.compose.ui.layout.onSizeChanged { s ->
            onChange(IntPair(s.width.toFloat(), s.height.toFloat()))
        }
    )
