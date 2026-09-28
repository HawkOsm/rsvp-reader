/** One displayed word, mirroring the Python engine's `Token` dataclass. */
export interface Token {
  text: string
  /** Marks the last word of a paragraph, for the breathing pause. */
  paraEnd: boolean
  /** 0-based page number; -1 for tokens with no page (plain text). */
  page: number
  /** Word rectangle in PDF points: [x0, y0, x1, y1]; null off-PDF. */
  bbox: [number, number, number, number] | null
}

export function makeToken(
  text: string,
  options: Partial<Omit<Token, 'text'>> = {},
): Token {
  return {
    text,
    paraEnd: options.paraEnd ?? false,
    page: options.page ?? -1,
    bbox: options.bbox ?? null,
  }
}
