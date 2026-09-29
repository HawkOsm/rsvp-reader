/*
 * RSVP Reader - Copyright (C) 2026 Osman Sahin Guler
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package io.github.hawkosm.rsvpreader

/**
 * One displayed word.
 *
 * [paraEnd] marks the last word of a paragraph, so the engine can add a
 * flat breathing pause.  [page] and [bbox] are filled in for PDFs only and
 * are what lets the page view point at the word being read; plain text has
 * no pages, so they stay -1 and null.
 */
data class Token(
    val text: String,
    val paraEnd: Boolean = false,
    val page: Int = -1,
    val bbox: FloatArray? = null,
) {
    val hasPlace: Boolean get() = page >= 0 && bbox != null

    // FloatArray needs these written out, or equality compares references.
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Token) return false
        return text == other.text && paraEnd == other.paraEnd &&
            page == other.page && bbox.contentEqualsOrNull(other.bbox)
    }

    override fun hashCode(): Int {
        var result = text.hashCode()
        result = 31 * result + paraEnd.hashCode()
        result = 31 * result + page
        result = 31 * result + (bbox?.contentHashCode() ?: 0)
        return result
    }
}

private fun FloatArray?.contentEqualsOrNull(other: FloatArray?): Boolean =
    if (this == null || other == null) this == null && other == null
    else this.contentEquals(other)
