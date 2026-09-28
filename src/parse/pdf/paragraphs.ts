import type { RawLine } from './types'

/**
 * Which lines end a paragraph, given lines already in reading order
 * (`sortReadingOrder`'s output, across the whole document).
 *
 * There's no PyMuPDF-style "block" here to key off of, so this is inferred
 * from vertical gaps: within a column, consecutive lines of one paragraph
 * sit a fairly constant distance apart (the type's line height); a
 * noticeably bigger gap is inter-paragraph spacing. A column or page
 * change, and the very last line of the document, always end a paragraph.
 */
export function markParagraphBreaks(lines: RawLine[]): boolean[] {
  const breaks = new Array<boolean>(lines.length).fill(false)
  if (lines.length === 0) return breaks

  const gaps: number[] = []
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1] as RawLine
    const cur = lines[i] as RawLine
    if (cur.page === prev.page && cur.y < prev.y) {
      gaps.push(prev.y - cur.y)
    }
  }
  gaps.sort((a, b) => a - b)
  const medianGap = gaps.length > 0 ? (gaps[Math.floor(gaps.length / 2)] as number) : 14

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i] as RawLine
    const next = lines[i + 1]
    if (!next) {
      breaks[i] = true // end of document
      continue
    }
    if (next.page !== cur.page) {
      breaks[i] = true // page turn
      continue
    }
    if (next.y >= cur.y) {
      breaks[i] = true // column turn: y didn't decrease, so a new column started
      continue
    }
    const gap = cur.y - next.y
    if (gap > medianGap * 1.35) breaks[i] = true
  }

  return breaks
}
