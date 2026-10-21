import type { Engine } from '../core/engine'
import { turn, type PageSpread } from './book-nav'
import { useAppStore } from './store'

// The DOM side of paging: scrolling the element that holds the page(s).
// book-nav.ts is pure token/page maths; anything that touches the document
// lives here.

/** id of the element that scrolls the page(s), so keyboard paging can find it. */
export const BOOK_SCROLL_ID = 'book-scroll'

/** Fraction of the viewport a scroll step covers, so no lines are skipped. */
const SCROLL_STEP = 0.85

/**
 * Scroll down a tall spread first, and only then turn it.
 * Returns true if it scrolled, false if the page was turned.
 *
 * A backwards turn that lands on a different spread sets the store's
 * `arriveAtBottom`, so the page view opens it at the bottom, where the
 * reader was heading.
 */
export function scrollOrTurn(
  engine: Engine,
  pageCount: number,
  spread: PageSpread,
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
  turn(engine, pageCount, spread, delta)
  useAppStore.getState().setArriveAtBottom(delta < 0 && engine.index !== before)
  return false
}
