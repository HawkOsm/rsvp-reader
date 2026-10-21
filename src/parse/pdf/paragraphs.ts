import type { RawLine } from './types'

/**
 * Which lines end a paragraph, given lines already in reading order across
 * the whole document.
 *
 * The extractor groups lines into blocks, and a change of block (or of
 * page, or the end of the document) is a paragraph break — the same rule
 * the original PyMuPDF-based reader used.
 */
export function markParagraphBreaks(lines: RawLine[]): boolean[] {
  return lines.map((line, i) => {
    const next = lines[i + 1]
    return !next || next.page !== line.page || next.block !== line.block
  })
}
