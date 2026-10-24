// Book mode's page geometry: how big a page is drawn and how a spread fits
// the window. Shared because the app store keeps the chosen scale and spread
// as settings; the paging logic itself is in features/reader/book-nav.ts.

/** How many pages book mode shows at once. Not to be confused with a book's
 * `ContentLayout` (paged or reflow), which is a fact about the book itself. */
export type PageSpread = 'spread' | 'single'

/** Book-mode page size is one number: the PDF scale, where 1 is 100% — the
 * page's real size. The slider, +/− and the fit button all just set it. */
export const MIN_SCALE = 0.25
export const MAX_SCALE = 5
export const SCALE_STEP = 0.1
export const clampScale = (scale: number) =>
  Math.round(Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale)) * 100) / 100

/** The gap down the middle of an open book, and the padding around the pages. */
export const GUTTER = 38
export const MARGIN = 16

export interface FitScales {
  /** The scale at which the whole spread is visible at once. */
  page: number
  /** The scale at which the spread fills the width. */
  width: number
}

/** The scales that fit a spread of pages (`sizes` at scale 1) into `box`.
 * Rounded down to a whole percent, so a fit never overflows by a hair. */
export function fitScales(
  sizes: { width: number; height: number }[],
  box: { width: number; height: number },
): FitScales {
  const count = Math.max(1, sizes.length)
  const pageWidth = Math.max(1, ...sizes.map((size) => size.width))
  const pageHeight = Math.max(1, ...sizes.map((size) => size.height))
  const width = (box.width - MARGIN - GUTTER * (count - 1)) / (count * pageWidth)
  const page = Math.min(width, (box.height - MARGIN) / pageHeight)
  const down = (scale: number) => clampScale(Math.floor(scale * 100) / 100)
  return { page: down(page), width: down(width) }
}
