import type { Engine } from '@/core/engine'
import type { Token } from '@/core/types'
import { type PageSpread } from '@/lib/book-layout'

// Ported from ui/book_view.py's paging logic. A page is a range of token
// indices, so the RSVP position and the book position are the same number
// and switching modes keeps the reader's place.

export function perSpread(spread: PageSpread): number {
  return spread === 'spread' ? 2 : 1
}

/** The left-hand page of the spread that `page` belongs to. */
export function spreadStart(page: number, spread: PageSpread): number {
  const per = perSpread(spread)
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
export function firstIndexAt(tokens: Token[], page: number, spread: PageSpread): number {
  const { first, pages } = pageIndexOf(tokens)
  for (let candidate = page; candidate < page + perSpread(spread); candidate++) {
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
  spread: PageSpread,
  page: number,
): void {
  if (pageCount <= 0) return
  const target = spreadStart(Math.max(0, Math.min(page, pageCount - 1)), spread)
  const current = spreadStart(pageOfToken(engine.tokens[engine.index]), spread)
  if (target === current) return
  engine.seek(firstIndexAt(engine.tokens, target, spread))
}

/** Flip to the next or previous spread. */
export function turn(engine: Engine, pageCount: number, spread: PageSpread, delta: number): void {
  const current = spreadStart(pageOfToken(engine.tokens[engine.index]), spread)
  goToPage(engine, pageCount, spread, current + delta * perSpread(spread))
}

/** "pages 3–4 / 340", or "page 3 / 340" for a single page. */
export function pageLabel(current: number, pageCount: number, spread: PageSpread): string {
  if (pageCount <= 0) return '—'
  const first = spreadStart(current, spread) + 1
  const last = Math.min(first + perSpread(spread) - 1, pageCount)
  return last > first ? `pages ${first}–${last} / ${pageCount}` : `page ${first} / ${pageCount}`
}
