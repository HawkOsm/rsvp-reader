/*
 * RSVP Reader - a local speed reader.
 * Copyright (C) 2026 Osman Sahin Guler
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.  See <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package io.github.hawkosm.rsvpreader

/**
 * The reading engine: how long to hold each word, and which letter to pin.
 *
 * A port of rsvp_engine.py.  The constants and the heuristic are
 * deliberately identical to the desktop and web versions so that all three
 * read at the same rhythm.
 */
object Rsvp {
    const val LONG_WORD_THRESHOLD = 6
    const val MS_PER_EXTRA_CHAR = 30.0
    const val SHORT_PAUSE_MULT = 1.5   // , ; : dashes
    const val LONG_PAUSE_MULT = 2.5    // . ! ? ...
    const val PARAGRAPH_PAUSE_MS = 350.0
    const val MIN_DELAY_MS = 20.0

    const val MIN_WPM = 50
    const val MAX_WPM = 1500
    const val DEFAULT_WPM = 300

    private val SHORT_PAUSE_CHARS = setOf(',', ';', ':', '—', '–')
    private val LONG_PAUSE_CHARS = setOf('.', '!', '?', '…')

    /** Trailing characters that wrap real punctuation. */
    private const val CLOSERS = "\"'’”»)]}*_"
    private const val STRIPPABLE =
        "\"'‘’“”«»()[]{}.,;:!?…—–-*_"

    /** The word without its surrounding punctuation and quotes. */
    fun core(word: String): String = word.trim { it in STRIPPABLE }

    /** How much longer to hold a word, based on what it ends with. */
    fun punctuationMultiplier(word: String): Double {
        val trimmed = word.trimEnd { it in CLOSERS }
        if (trimmed.isEmpty()) return 1.0
        return when (trimmed.last()) {
            in LONG_PAUSE_CHARS -> LONG_PAUSE_MULT
            in SHORT_PAUSE_CHARS -> SHORT_PAUSE_MULT
            else -> 1.0
        }
    }

    /** Milliseconds to hold [token] on screen at [wpm]. */
    fun delayFor(token: Token, wpm: Int): Double {
        var base = 60000.0 / maxOf(1, wpm)
        val length = core(token.text).length.takeIf { it > 0 } ?: token.text.length
        base += MS_PER_EXTRA_CHAR * maxOf(0, length - LONG_WORD_THRESHOLD)
        var delay = base * punctuationMultiplier(token.text)
        if (token.paraEnd) delay += PARAGRAPH_PAUSE_MS
        return maxOf(MIN_DELAY_MS, delay)
    }

    /**
     * Index of the Optimal Recognition Point letter within [word].
     *
     * Standard heuristic on the letters of the word (leading quotes and
     * brackets are skipped): 1 letter -> the 1st, 2-5 -> the 2nd, 6-9 ->
     * the 3rd, 10-13 -> the 4th, longer -> the 5th.
     */
    fun orpIndex(word: String): Int {
        if (word.isEmpty()) return 0
        var start = 0
        while (start < word.length - 1 && !word[start].isLetterOrDigit()) start++
        val tail = word.substring(start)
        val c = core(tail).takeIf { it.isNotEmpty() } ?: tail
        val offset = when {
            c.length <= 1 -> 0
            c.length <= 5 -> 1
            c.length <= 9 -> 2
            c.length <= 13 -> 3
            else -> 4
        }
        return minOf(start + offset, word.length - 1)
    }
}
