import { makeToken, type Token } from '../../core/types'
import type { RawLine, RawWord } from './types'

const HYPHEN_RE = /[-‐‑]$/

/**
 * Rejoin words split across a line break by a hyphen, and mark paragraph
 * ends — the same two jobs `text_extract.py`'s `tokenize_pdf()` does, ported
 * to lines built from pdf.js instead of PyMuPDF's word-level extraction.
 *
 * A line-final word ending in a hyphen becomes a pending fragment; the next
 * word either continues it (lowercase start: the hyphen only broke the
 * line) or the hyphen was real (anything else: keep it, join with `-`).
 * `lineEndsParagraph[i]` (from `markParagraphBreaks`) decides which word
 * gets `paraEnd` — if that word turns out to be a pending fragment, the
 * flag travels with it to wherever it's finally resolved, so the paragraph
 * pause lands on the word the reader actually sees last.
 */
export function flattenPdfWords(lines: RawLine[], lineEndsParagraph: boolean[]): Token[] {
  const out: Token[] = []
  let pending: RawWord | null = null
  let pendingParaEnd = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as RawLine
    const isParaEndLine = lineEndsParagraph[i] ?? false

    for (let w = 0; w < line.words.length; w++) {
      const word = line.words[w] as RawWord
      const isLastWordOfLine = w === line.words.length - 1

      if (pending) {
        const stem = pending
        const stemParaEnd = pendingParaEnd
        pending = null
        pendingParaEnd = false
        const joinsLower = /^[a-z]/.test(word.text)
        const text = joinsLower ? stem.text + word.text : `${stem.text}-${word.text}`
        out.push(
          makeToken(text, { page: stem.page, bbox: stem.bbox, paraEnd: stemParaEnd }),
        )
        continue
      }

      const shouldDefer = isLastWordOfLine && word.text.length > 1 && HYPHEN_RE.test(word.text)
      if (shouldDefer) {
        pending = { ...word, text: word.text.slice(0, -1) }
        pendingParaEnd = isParaEndLine
        continue
      }

      out.push(
        makeToken(word.text, {
          page: word.page,
          bbox: word.bbox,
          paraEnd: isLastWordOfLine && isParaEndLine,
        }),
      )
    }
  }

  if (pending) {
    out.push(
      makeToken(pending.text, { page: pending.page, bbox: pending.bbox, paraEnd: pendingParaEnd }),
    )
  }

  return out
}
