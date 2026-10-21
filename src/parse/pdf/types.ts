export interface RawWord {
  text: string
  page: number
  /** [x0, y0, x1, y1] in `Token.bbox`'s convention: PDF points, origin at
   * the bottom-left of the page as displayed, y up. */
  bbox: [number, number, number, number]
}

/** One line of a page, in reading order. */
export interface RawLine {
  page: number
  /** The extractor's paragraph grouping: lines of one block belong
   * together. Only comparable within a page. */
  block: number
  words: RawWord[]
}
