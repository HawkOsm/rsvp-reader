/** Structural subset of pdf.js's `TextItem`, so the line/word extraction
 * logic can be unit-tested with hand-built fixtures instead of a real PDF. */
export interface PdfTextItem {
  str: string
  /** [scaleX, skewY, skewX, scaleY, x, y] in PDF user space. */
  transform: number[]
  width: number
  height: number
  hasEOL: boolean
}

export interface RawWord {
  text: string
  page: number
  /** [x0, y0, x1, y1] — a proportional-width estimate from the item's total
   * width, not real glyph metrics. Good enough for a highlight rectangle or
   * click-to-jump target; see DECISIONS.md. */
  bbox: [number, number, number, number]
}

export interface RawLine {
  page: number
  words: RawWord[]
  /** Baseline y of the line, in PDF user space (bigger = higher on page). */
  y: number
  /** Leftmost x of the line's first word. */
  x0: number
}
