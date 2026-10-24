import type { PageLine, PageWord } from '@/pdf/document'

// Turns what Tesseract found on a page image into the same `PageLine`s the
// PDF text layer gives, so everything after (header/footer removal,
// paragraphs, hyphen rejoining, the page view's highlight) is shared.

/** The part of Tesseract's page result this uses. */
export interface OcrBlocks {
  blocks:
    | {
        paragraphs: {
          lines: {
            words: {
              text: string
              confidence: number
              bbox: { x0: number; y0: number; x1: number; y1: number }
            }[]
          }[]
        }[]
      }[]
    | null
}

/** Tesseract scores each word 0-100. Below this it is almost always a
 * speck or a smudge read as a letter, and keeping it would put a stray
 * "l" or "." into the reading. */
export const MIN_WORD_CONFIDENCE = 30

/**
 * @param scale pixels per PDF point the page image was drawn at, to turn
 *   Tesseract's pixel boxes back into page points (y down, from the top).
 */
export function ocrToLines(page: OcrBlocks, scale: number): PageLine[] {
  const lines: PageLine[] = []

  // Lines are grouped by Tesseract's layout block, not its paragraphs: its
  // paragraph guesses split a plain paragraph after a short first line, and
  // every false split is a pause the reader did not ask for.
  for (const [blockIndex, block] of (page.blocks ?? []).entries()) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        const words: PageWord[] = []
        for (const word of line.words) {
          const text = word.text.trim()
          if (text === '' || word.confidence < MIN_WORD_CONFIDENCE) continue
          words.push({
            text,
            x0: word.bbox.x0 / scale,
            y0: word.bbox.y0 / scale,
            x1: word.bbox.x1 / scale,
            y1: word.bbox.y1 / scale,
          })
        }
        if (words.length === 0) continue
        lines.push({
          block: blockIndex,
          // Tesseract gives a baseline too, but its box bottom is as good
          // for ordering and is always present.
          baseline: Math.max(...words.map((w) => w.y1)),
          words,
        })
      }
    }
  }
  return lines
}
