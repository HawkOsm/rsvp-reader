/*
 * RSVP Reader - Copyright (C) 2026 Osman Sahin Guler
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package io.github.hawkosm.rsvpreader

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The page the reader is on, with the current word marked.
 *
 * Word rectangles are in PDF points and the page is drawn at whatever width
 * the phone has, so every coordinate goes through one scale factor: pixels
 * per point.  Taps are converted back the same way to find the word under a
 * finger.
 */
@Composable
fun PageView(vm: ReaderViewModel, modifier: Modifier = Modifier) {
    val page = vm.pageImage
    if (page == null) {
        Box(modifier.fillMaxSize(), Alignment.Center) {
            CircularProgressIndicator(color = Accent)
        }
        return
    }

    val scroll = rememberScrollState()
    val image = remember(page.bitmap) { page.bitmap.asImageBitmap() }
    val viewportHeight = remember { mutableIntStateOf(0) }

    Column(modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().background(Bg).padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton({ vm.turnPage(-1) }, enabled = vm.canPageBack) {
                Text("‹", fontSize = 22.sp, color = if (vm.canPageBack) TextCol else BorderCol)
            }
            Text(
                "page ${page.pageNo + 1} / ${vm.pdfPageCount}",
                color = DimCol, modifier = Modifier.weight(1f),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            TextButton({ vm.turnPage(1) }, enabled = vm.canPageOn) {
                Text("›", fontSize = 22.sp, color = if (vm.canPageOn) TextCol else BorderCol)
            }
        }

        Box(
            Modifier.weight(1f).fillMaxWidth()
                .background(Color(0xFF0F1115))
                .verticalScroll(scroll)
                .onSizeChanged { viewportHeight.intValue = it.height },
        ) {
            val token = vm.token
            val highlight = token?.takeIf { it.hasPlace && it.page == page.pageNo }?.bbox

            Canvas(
                Modifier.fillMaxWidth()
                    .aspectRatio(page.pointWidth / page.pointHeight)
                    .pointerInput(page.pageNo, page.pointWidth) {
                        detectTapGestures { offset ->
                            // Pixels back to PDF points, then find the word.
                            val scale = size.width / page.pointWidth
                            if (scale > 0f) {
                                vm.seekToPoint(offset.x / scale, offset.y / scale)
                            }
                        }
                    }
            ) {
                drawImage(
                    image = image,
                    srcOffset = IntOffset.Zero,
                    srcSize = IntSize(image.width, image.height),
                    dstOffset = IntOffset.Zero,
                    dstSize = IntSize(size.width.toInt(), size.height.toInt()),
                )

                if (highlight != null) {
                    val scale = size.width / page.pointWidth
                    val left = highlight[0] * scale
                    val top = highlight[1] * scale
                    val width = (highlight[2] - highlight[0]) * scale
                    val height = (highlight[3] - highlight[1]) * scale
                    drawRect(
                        color = Accent.copy(alpha = 0.28f),
                        topLeft = Offset(left - 2f, top - 2f),
                        size = Size(width + 4f, height + 4f),
                    )
                    drawRect(
                        color = Accent,
                        topLeft = Offset(left - 2f, top + height),
                        size = Size(width + 4f, 3f),
                    )
                }
            }

            // Keep the marked word on screen as reading moves down the page.
            LaunchedEffect(vm.index, page.pageNo, scroll.maxValue) {
                val box = highlight ?: return@LaunchedEffect
                val viewport = viewportHeight.intValue
                if (viewport <= 0 || scroll.maxValue <= 0) return@LaunchedEffect
                // The drawn page is the scrollable range plus one viewport.
                val pixelsPerPoint = (scroll.maxValue + viewport) / page.pointHeight
                val target = (box[1] * pixelsPerPoint - viewport / 3f).toInt()
                scroll.animateScrollTo(target.coerceIn(0, scroll.maxValue))
            }
        }

        Text(
            "tap a word to read from there",
            color = DimCol, fontSize = 12.sp,
            modifier = Modifier.fillMaxWidth().background(Bg).padding(vertical = 4.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}
