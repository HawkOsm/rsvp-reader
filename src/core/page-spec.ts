/** A book's page, in PDF points (1/72 inch). Scanned once when the book is
 * imported and never changed, so it is frozen. */
export interface PageSpec {
  readonly width: number
  readonly height: number
}

/** Named page sizes, so a size is one name instead of two numbers. */
export const PAGE_PRESETS = {
  book: { width: 432, height: 648 }, // 6 x 9 in
  letter: { width: 612, height: 792 },
  a4: { width: 595, height: 842 },
} as const satisfies Record<string, PageSpec>

export type PagePreset = keyof typeof PAGE_PRESETS

/** The page of anything that has none of its own (text, EPUB). */
export const DEFAULT_PAGE_PRESET: PagePreset = 'book'

/** A frozen page of this size; the one way a `PageSpec` is made. */
export function makePageSpec(width: number, height: number): PageSpec {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return DEFAULT_PAGE
  }
  return Object.freeze({ width, height })
}

export const DEFAULT_PAGE: PageSpec = Object.freeze({ ...PAGE_PRESETS[DEFAULT_PAGE_PRESET] })

/** Width over height: how a sheet of this page is shaped. */
export const aspectOf = (page: PageSpec): number => page.width / page.height
