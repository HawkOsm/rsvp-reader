import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEngine } from '../../src/core/engine'
import { makeToken } from '../../src/core/types'
import { BOOK_SCROLL_ID, scrollOrTurn } from '../../src/ui/book-scroll'
import { useAppStore } from '../../src/ui/store'

// Two words on each of pages 0, 1 and 2.
const tokens = [0, 0, 1, 1, 2, 2].map((page) => makeToken('w', { page }))

/** jsdom does no layout, so give the scroll element the sizes we want. */
function addScroller(sizes: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  const el = document.createElement('div')
  el.id = BOOK_SCROLL_ID
  for (const [key, value] of Object.entries(sizes)) {
    Object.defineProperty(el, key, { value, configurable: true })
  }
  el.scrollBy = vi.fn()
  document.body.append(el)
  return el
}

beforeEach(() => {
  useAppStore.setState({ arriveAtBottom: false })
})
afterEach(() => {
  document.getElementById(BOOK_SCROLL_ID)?.remove()
})

describe('scrollOrTurn', () => {
  it('scrolls a tall spread before turning it', () => {
    const el = addScroller({ scrollHeight: 1500, clientHeight: 500, scrollTop: 0 })
    const engine = createEngine(tokens)
    expect(scrollOrTurn(engine, 3, 'single', 1)).toBe(true)
    expect(el.scrollBy).toHaveBeenCalledWith({ top: 425 }) // 85% of the viewport
    expect(engine.index).toBe(0)
  })

  it('scrolls back up before turning back', () => {
    const el = addScroller({ scrollHeight: 1500, clientHeight: 500, scrollTop: 500 })
    const engine = createEngine(tokens, { index: 2 })
    expect(scrollOrTurn(engine, 3, 'single', -1)).toBe(true)
    expect(el.scrollBy).toHaveBeenCalledWith({ top: -425 })
    expect(engine.index).toBe(2)
  })

  it('clears a stale arrive-at-bottom flag when turning forwards', () => {
    useAppStore.setState({ arriveAtBottom: true })
    addScroller({ scrollHeight: 500, clientHeight: 500, scrollTop: 0 })
    scrollOrTurn(createEngine(tokens), 3, 'single', 1)
    expect(useAppStore.getState().arriveAtBottom).toBe(false)
  })

  it('does not notify store subscribers when the flag has not changed', () => {
    addScroller({ scrollHeight: 500, clientHeight: 500, scrollTop: 0 })
    let notified = 0
    const unsubscribe = useAppStore.subscribe(() => notified++)
    scrollOrTurn(createEngine(tokens), 3, 'single', 1) // flag stays false
    useAppStore.getState().consumeArriveAtBottom() // flag already false
    unsubscribe()
    expect(notified).toBe(0)
  })

  it('turns the page once scrolled to the bottom', () => {
    addScroller({ scrollHeight: 1500, clientHeight: 500, scrollTop: 1000 })
    const engine = createEngine(tokens)
    expect(scrollOrTurn(engine, 3, 'single', 1)).toBe(false)
    expect(engine.index).toBe(2)
    expect(useAppStore.getState().arriveAtBottom).toBe(false)
  })

  it('turns straight away when the spread fits without scrolling', () => {
    addScroller({ scrollHeight: 500, clientHeight: 500, scrollTop: 0 })
    const engine = createEngine(tokens)
    expect(scrollOrTurn(engine, 3, 'single', 1)).toBe(false)
    expect(engine.index).toBe(2)
  })

  it('turns when nothing is on screen to scroll', () => {
    const engine = createEngine(tokens)
    expect(scrollOrTurn(engine, 3, 'single', 1)).toBe(false)
    expect(engine.index).toBe(2)
  })

  it('arrives at the bottom after turning back to the previous spread', () => {
    addScroller({ scrollHeight: 1500, clientHeight: 500, scrollTop: 0 })
    const engine = createEngine(tokens, { index: 2 })
    expect(scrollOrTurn(engine, 3, 'single', -1)).toBe(false)
    expect(engine.index).toBe(0)
    expect(useAppStore.getState().consumeArriveAtBottom()).toBe(true)
    expect(useAppStore.getState().consumeArriveAtBottom()).toBe(false) // read once
  })

  it('does not arrive at the bottom when already on the first page', () => {
    addScroller({ scrollHeight: 1500, clientHeight: 500, scrollTop: 0 })
    const engine = createEngine(tokens)
    scrollOrTurn(engine, 3, 'single', -1)
    expect(engine.index).toBe(0)
    expect(useAppStore.getState().arriveAtBottom).toBe(false)
  })
})
