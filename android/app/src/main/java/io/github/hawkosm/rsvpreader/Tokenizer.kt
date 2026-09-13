/*
 * RSVP Reader - Copyright (C) 2026 Osman Sahin Guler
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
package io.github.hawkosm.rsvpreader

/**
 * Plain text -> token list.  A port of text_extract.py, with the same
 * normalisation so a file tokenises identically on every platform.
 */
object Tokenizer {

    private const val SOFT_HYPHEN = '\u00ad'

    // A hyphen ending a line, between two letters, is a word the
    // typesetter broke across lines rather than a real hyphen.
    private val LINE_HYPHEN = Regex("(\\w)[-\u2010\u2011]\\n(?=[a-z\u00e0-\u00ff])")
    private val BLANK_LINES = Regex("\\n{2,}")
    private val SOFT_WRAP = Regex("(?<!\\n)\\n(?!\\n)")
    private val HORIZONTAL_SPACE = Regex("[ \\t\u00a0\u2007\u202f]+")
    private val WHITESPACE = Regex("\\s+")

    fun normalize(raw: String): String {
        var text = raw.replace("\r\n", "\n").replace("\r", "\n")
        text = text.replace(SOFT_HYPHEN.toString(), "").replace("\u000c", "\n\n")
        text = LINE_HYPHEN.replace(text, "$1")
        text = BLANK_LINES.replace(text, "\n\n")
        text = SOFT_WRAP.replace(text, " ")
        text = HORIZONTAL_SPACE.replace(text, " ")
        return text.trim()
    }

    /** Split normalised text into display tokens, punctuation attached. */
    fun tokenize(text: String): List<Token> {
        val tokens = mutableListOf<Token>()
        for (paragraph in text.split("\n\n")) {
            val words = paragraph.split(WHITESPACE).filter { it.isNotEmpty() }
            if (words.isEmpty()) continue
            words.forEachIndexed { i, word ->
                tokens.add(Token(word, paraEnd = i == words.lastIndex))
            }
        }
        return tokens
    }

    fun tokenizeText(raw: String): List<Token> = tokenize(normalize(raw))
}
