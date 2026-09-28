import type { PdfTextItem, RawLine, RawWord } from './types'

const WORD_RE = /\S+/g

/**
 * Group a page's text items into lines and split each into words.
 *
 * pdf.js hands back "items" that are runs of same-style text, not
 * individual words — many PDF generators (this project's own synthetic
 * fixtures included) emit a whole line as one item, spaces and all, so
 * splitting each item's `str` on whitespace already recovers most words
 * directly. The two things that need extra care:
 *
 * - `hasEOL` marks the item that ends a visual line — used to close a line
 *   and start the next.
 * - Two adjacent items with no whitespace between their text AND no real
 *   horizontal gap between them are a word split mid-way by a font/style
 *   change (e.g. one italicised letter); those get glued back into one
 *   word instead of read as separate ones.
 *
 * A word's bbox is estimated proportionally from its item's total width
 * (device-space glyph metrics aren't available from getTextContent) — good
 * enough for a highlight rectangle or click-to-jump target, not pixel
 * accurate. See DECISIONS.md.
 */
export function itemsToLines(items: PdfTextItem[], page: number): RawLine[] {
  const lines: RawLine[] = []
  let words: RawWord[] = []
  let lineY = 0
  let lineX0 = Infinity
  let havePrevItem = false
  let prevItemEndX = 0
  let prevItemEndsWithSpace = true

  function flushLine(): void {
    if (words.length > 0) {
      lines.push({ page, words, y: lineY, x0: lineX0 })
    }
    words = []
    lineX0 = Infinity
    havePrevItem = false
  }

  for (const item of items) {
    const str = item.str
    if (str.length === 0) {
      if (item.hasEOL) flushLine()
      continue
    }

    const a = item.transform[0] ?? 0
    const e = item.transform[4] ?? 0
    const f = item.transform[5] ?? 0
    const fontScale = Math.abs(a) || item.height || 1
    const gap = e - prevItemEndX

    let firstWordInItem = true
    WORD_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = WORD_RE.exec(str)) !== null) {
      const startChar = match.index
      const endChar = match.index + match[0].length
      const x0 = e + item.width * (startChar / str.length)
      const x1 = e + item.width * (endChar / str.length)

      const glue =
        firstWordInItem &&
        havePrevItem &&
        startChar === 0 &&
        !prevItemEndsWithSpace &&
        gap <= 0.15 * fontScale

      if (glue) {
        const prev = words[words.length - 1]
        if (prev) {
          prev.text += match[0]
          prev.bbox[2] = x1
        }
      } else {
        words.push({ text: match[0], page, bbox: [x0, f, x1, f + item.height] })
        if (x0 < lineX0) lineX0 = x0
      }
      firstWordInItem = false
    }

    lineY = f
    prevItemEndX = e + item.width
    prevItemEndsWithSpace = /\s$/.test(str)
    havePrevItem = true

    if (item.hasEOL) flushLine()
  }
  flushLine()

  return lines
}
