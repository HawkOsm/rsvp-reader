/** Which parser produced a book. The one format-specific fact `core/` knows. */
export type FormatId = 'pdf' | 'epub' | 'text'

/** What kind of content a book has: real pages that render the original
 * (PDF), or text the app lays out itself. */
export type ContentLayout =
  /** `boxSpace: 'displayed'` means this book's `Token.bbox`es are on the page
   * as displayed (rotation and crop applied). Without it they are in raw PDF
   * user space, as the pdf.js-based versions stored them, and need the
   * page's own transform to find where they are drawn. */
  { kind: 'paged'; pages: number; boxSpace?: 'displayed' } | { kind: 'reflow' }

/** One displayed word, mirroring the Python engine's `Token` dataclass. */
export interface Token {
  text: string
  /** Marks the last word of a paragraph, for the breathing pause. */
  paraEnd: boolean
  /** 0-based page number; -1 for tokens with no page (plain text). */
  page: number
  /** Word rectangle [x0, y0, x1, y1] in PDF points, with the origin at the
   * bottom-left of the page as displayed and y growing up (PDF's own
   * convention); null off-PDF. `pdf/geometry.ts` converts to and from the
   * screen. */
  bbox: [number, number, number, number] | null
}

export function makeToken(text: string, options: Partial<Omit<Token, 'text'>> = {}): Token {
  return {
    text,
    paraEnd: options.paraEnd ?? false,
    page: options.page ?? -1,
    bbox: options.bbox ?? null,
  }
}
