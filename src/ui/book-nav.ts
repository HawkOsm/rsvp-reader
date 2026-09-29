import type { Engine } from '../core/engine'
import type { Token } from '../core/types'

// Ported from ui/book_view.py's paging logic. A page is a range of token
// indices, so the RSVP position and the book position are the same number
// and switching modes keeps the reader's place.

export type BookLayout = 'spread' | 'single'

/** Fraction of the viewport a scroll step covers, so no lines are skipped. */
const SCROLL_STEP = 0.85

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

/** id of the element that scrolls the page(s), so keyboard paging can find it. */
export const BOOK_SCROLL_ID = 'book-scroll'

export function perSpread(layout: BookLayout): number {
  return layout === 'spread' ? 2 : 1
}

/** The left-hand page of the spread that `page` belongs to. */
export function spreadStart(page: number, layout: BookLayout): number {
  const per = perSpread(layout)
  return Math.floor(page / per) * per
}

/** Which page a token sits on; 0 for tokens with no page. */
export function pageOfToken(token: Token | null | undefined): number {
  return token && token.page >= 0 ? token.page : 0
}

interface PageIndex {
  /** page number -> index of the first token on it */
  first: Map<number, number>
  /** pages that have any text, ascending */
  pages: number[]
}

const pageIndexCache = new WeakMap<Token[], PageIndex>()

function pageIndexOf(tokens: Token[]): PageIndex {
  const cached = pageIndexCache.get(tokens)
  if (cached) return cached
  const first = new Map<number, number>()
  tokens.forEach((token, index) => {
    if (token.page >= 0 && !first.has(token.page)) first.set(token.page, index)
  })
  const built = { first, pages: [...first.keys()].sort((a, b) => a - b) }
  pageIndexCache.set(tokens, built)
  return built
}

/** First word on this spread, falling back to the nearest page that has text. */
export function firstIndexAt(tokens: Token[], page: number, layout: BookLayout): number {
  const { first, pages } = pageIndexOf(tokens)
  for (let candidate = page; candidate < page + perSpread(layout); candidate++) {
    const found = first.get(candidate)
    if (found !== undefined) return found
  }
  if (pages.length === 0) return 0
  let nearest = pages[0] as number
  for (const p of pages) {
    if (Math.abs(p - page) < Math.abs(nearest - page)) nearest = p
  }
  return first.get(nearest) as number
}

/** The token indices `[start, end)` that sit on `page`. */
function pageTokenRange(tokens: Token[], page: number): [number, number] {
  const start = pageIndexOf(tokens).first.get(page)
  if (start === undefined) return [0, 0]
  let end = start
  while (end < tokens.length && tokens[end]?.page === page) end++
  return [start, end]
}

/** A click this many PDF points away from a word still selects it. */
const CLICK_SLACK = 12

/** The word on `page` nearest the PDF-space point (x, y), if any is within
 * reach — how a click on the page becomes a place to jump to. */
export function wordAt(tokens: Token[], page: number, x: number, y: number): number | null {
  const [start, end] = pageTokenRange(tokens, page)
  let best: number | null = null
  let bestDistance = CLICK_SLACK
  for (let i = start; i < end; i++) {
    const box = tokens[i]?.bbox
    if (!box) continue
    const dx = Math.max(Math.min(box[0], box[2]) - x, 0, x - Math.max(box[0], box[2]))
    const dy = Math.max(Math.min(box[1], box[3]) - y, 0, y - Math.max(box[1], box[3]))
    const distance = Math.hypot(dx, dy)
    if (distance <= bestDistance) {
      best = i
      bestDistance = distance
    }
  }
  return best
}

/** Seek to the spread containing `page`. No-op if it is already showing. */
export function goToPage(
  engine: Engine,
  pageCount: number,
  layout: BookLayout,
  page: number,
): void {
  if (pageCount <= 0) return
  const target = spreadStart(Math.max(0, Math.min(page, pageCount - 1)), layout)
  const current = spreadStart(pageOfToken(engine.tokens[engine.index]), layout)
  if (target === current) return
  engine.seek(firstIndexAt(engine.tokens, target, layout))
}

/** Flip to the next or previous spread. */
export function turn(engine: Engine, pageCount: number, layout: BookLayout, delta: number): void {
  const current = spreadStart(pageOfToken(engine.tokens[engine.index]), layout)
  goToPage(engine, pageCount, layout, current + delta * perSpread(layout))
}

/** Set when a backwards turn should land at the bottom of the previous
 * spread; the page view consumes it once the new pages have laid out. */
let arriveAtBottom = false
export function consumeArriveAtBottom(): boolean {
  const value = arriveAtBottom
  arriveAtBottom = false
  return value
}

/**
 * Scroll down a tall spread first, and only then turn it.
 * Returns true if it scrolled, false if the page was turned.
 */
export function scrollOrTurn(
  engine: Engine,
  pageCount: number,
  layout: BookLayout,
  delta: number,
): boolean {
  const el = document.getElementById(BOOK_SCROLL_ID)
  if (el) {
    const max = el.scrollHeight - el.clientHeight
    const roomLeft = delta > 0 ? el.scrollTop < max - 1 : el.scrollTop > 0
    if (max > 1 && roomLeft) {
      el.scrollBy({ top: Math.sign(delta) * Math.floor(el.clientHeight * SCROLL_STEP) })
      return true
    }
  }
  const before = engine.index
  turn(engine, pageCount, layout, delta)
  arriveAtBottom = delta < 0 && engine.index !== before
  return false
}

/** "pages 3–4 / 340", or "page 3 / 340" for a single page. */
export function pageLabel(current: number, pageCount: number, layout: BookLayout): string {
  if (pageCount <= 0) return '—'
  const first = spreadStart(current, layout) + 1
  const last = Math.min(first + perSpread(layout) - 1, pageCount)
  return last > first ? `pages ${first}–${last} / ${pageCount}` : `page ${first} / ${pageCount}`
}
