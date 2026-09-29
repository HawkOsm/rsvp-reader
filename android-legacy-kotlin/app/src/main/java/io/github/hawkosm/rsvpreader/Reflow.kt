/*
 * RSVP Reader - Copyright (C) 2026 Osman Sahin Guler
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package io.github.hawkosm.rsvpreader

import android.graphics.Paint

/** One word on a laid-out line, with its offset from the column's left edge. */
data class LaidWord(val index: Int, val text: String, val x: Float)

/**
 * Plain text laid out into book-shaped pages.
 *
 * Text files have no pages of their own, so they are made: words are
 * wrapped into lines and lines grouped into screenfuls.  A port of
 * ReflowCanvas in ui/book_view.py, minus the two-page spread, which is
 * pointless on a phone.
 */
class ReflowLayout(
    val pages: List<List<List<LaidWord>>>,
    private val firstIndex: List<Int>,
    val lineHeight: Float,
    val columnWidth: Float,
) {
    val pageCount: Int get() = pages.size

    /** Which page holds [index] - binary search over each page's first word. */
    fun pageOf(index: Int): Int {
        if (firstIndex.isEmpty()) return 0
        var low = 0
        var high = firstIndex.lastIndex
        var answer = 0
        while (low <= high) {
            val mid = (low + high) / 2
            if (firstIndex[mid] <= index) { answer = mid; low = mid + 1 } else high = mid - 1
        }
        return answer
    }

    fun firstIndexOf(page: Int): Int =
        firstIndex.getOrElse(page.coerceIn(0, firstIndex.lastIndex.coerceAtLeast(0))) { 0 }

    companion object {
        const val LINE_SPACING = 1.6f

        /**
         * Break [tokens] into lines that fit [columnWidth] and pages that
         * fit [usableHeight].  Word widths are cached because documents
         * repeat words constantly and measureText is the slow part.
         */
        fun paginate(
            tokens: List<Token>,
            paint: Paint,
            columnWidth: Float,
            usableHeight: Float,
        ): ReflowLayout {
            val lineHeight = (paint.descent() - paint.ascent()) * LINE_SPACING
            if (tokens.isEmpty() || columnWidth <= 0f || lineHeight <= 0f ||
                usableHeight < lineHeight
            ) {
                return ReflowLayout(emptyList(), emptyList(), maxOf(lineHeight, 1f), columnWidth)
            }
            val linesPerPage = maxOf(1, (usableHeight / lineHeight).toInt())

            val widths = HashMap<String, Float>()
            fun widthOf(word: String) = widths.getOrPut(word) { paint.measureText(word) }
            val space = widthOf(" ")

            val pages = mutableListOf<List<List<LaidWord>>>()
            var page = mutableListOf<List<LaidWord>>()
            var line = mutableListOf<LaidWord>()
            var x = 0f

            fun endLine() {
                page.add(line)
                line = mutableListOf()
                x = 0f
                if (page.size >= linesPerPage) { pages.add(page); page = mutableListOf() }
            }

            tokens.forEachIndexed { i, token ->
                val width = widthOf(token.text)
                if (line.isNotEmpty() && x + space + width > columnWidth) endLine()
                if (line.isNotEmpty()) x += space
                line.add(LaidWord(i, token.text, x))
                x += width
                if (token.paraEnd) {
                    endLine()
                    // A blank line between paragraphs, unless the page just turned.
                    if (page.isNotEmpty()) {
                        page.add(emptyList())
                        if (page.size >= linesPerPage) { pages.add(page); page = mutableListOf() }
                    }
                }
            }
            if (line.isNotEmpty()) page.add(line)
            if (page.isNotEmpty()) pages.add(page)

            val firsts = pages.map { p ->
                p.firstOrNull { it.isNotEmpty() }?.first()?.index ?: 0
            }
            return ReflowLayout(pages, firsts, lineHeight, columnWidth)
        }
    }
}
