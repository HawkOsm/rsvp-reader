/*
 * RSVP Reader - Copyright (C) 2026 Osman Sahin Guler
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package io.github.hawkosm.rsvpreader

import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.text.TextPosition

/**
 * PDF -> token list, keeping each word's page and rectangle.
 *
 * Android has no equivalent of PyMuPDF's `get_text("words")`.  PDFBox
 * hands back individual glyphs with coordinates, so words are assembled
 * here: glyphs are grouped on whitespace, their boxes unioned, and a
 * hyphen at the end of a line rejoined with the word that follows - the
 * same rules text_extract.py applies.
 */
object PdfText {

    fun extract(document: PDDocument, onPage: ((Int, Int) -> Unit)? = null): List<Token> {
        val tokens = mutableListOf<Token>()
        // A fragment left dangling by a line-ending hyphen.
        var pending: Token? = null
        var lastBottom = Float.NaN
        var lastHeight = 12f

        val stripper = object : PDFTextStripper() {
            override fun writeString(text: String, positions: List<TextPosition>) {
                if (positions.isEmpty()) return
                val pageNo = currentPageNo - 1   // PDFBox counts from 1

                val height = positions.first().heightDir.takeIf { it > 0f } ?: lastHeight
                val top = positions.first().yDirAdj - height
                if (!lastBottom.isNaN() && kotlin.math.abs(top - lastBottom) > height * 1.8f
                    && tokens.isNotEmpty()
                ) {
                    // A gap bigger than a line: treat it as a paragraph break.
                    tokens[tokens.lastIndex] = tokens.last().copy(paraEnd = true)
                }
                lastBottom = top
                lastHeight = height

                // Group glyphs into words on whitespace.
                var word = StringBuilder()
                var box: FloatArray? = null
                fun flush(endOfLine: Boolean) {
                    val piece = word.toString()
                    word = StringBuilder()
                    val rect = box
                    box = null
                    if (piece.isBlank() || rect == null) return

                    val held = pending
                    if (held != null) {
                        pending = null
                        val joined = if (piece.first().isLowerCase()) held.text + piece
                        else held.text + "-" + piece
                        tokens.add(held.copy(text = joined))
                        return
                    }
                    if (endOfLine && piece.length > 1 &&
                        (piece.last() == '-' || piece.last() == '\u2010' || piece.last() == '\u2011')
                    ) {
                        pending = Token(piece.dropLast(1), false, pageNo, rect)
                        return
                    }
                    tokens.add(Token(piece, false, pageNo, rect))
                }

                for (glyph in positions) {
                    val ch = glyph.unicode ?: continue
                    if (ch.isBlank()) { flush(false); continue }
                    word.append(ch)
                    val gh = glyph.heightDir.takeIf { it > 0f } ?: height
                    val x0 = glyph.xDirAdj
                    val y0 = glyph.yDirAdj - gh
                    val x1 = x0 + glyph.widthDirAdj
                    val y1 = glyph.yDirAdj
                    val current = box
                    box = if (current == null) floatArrayOf(x0, y0, x1, y1)
                    else floatArrayOf(
                        minOf(current[0], x0), minOf(current[1], y0),
                        maxOf(current[2], x1), maxOf(current[3], y1),
                    )
                }
                flush(true)   // the chunk ends at a line break
                onPage?.invoke(pageNo + 1, document.numberOfPages)
            }
        }
        stripper.sortByPosition = true
        stripper.startPage = 1
        stripper.endPage = document.numberOfPages
        // getText drives writeString for the whole document; the text it
        // returns is discarded because the tokens carry the positions.
        stripper.getText(document)

        pending?.let { tokens.add(it) }
        if (tokens.isNotEmpty()) {
            tokens[tokens.lastIndex] = tokens.last().copy(paraEnd = true)
        }
        return tokens
    }
}
