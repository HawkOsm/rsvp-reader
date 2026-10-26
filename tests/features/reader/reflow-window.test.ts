import { describe, expect, it } from 'vitest'
import { followIndex, grow, MAX, RADIUS, STEP, windowAround } from '@/features/reader/reflow-window'

describe('windowAround', () => {
  it('centres on the word, clipped to the book', () => {
    expect(windowAround(5000, 100_000)).toEqual({ start: 5000 - RADIUS, end: 5000 + RADIUS })
    expect(windowAround(10, 100)).toEqual({ start: 0, end: 100 })
  })
})

describe('followIndex', () => {
  const win = { start: 1000, end: 4000 }

  it('keeps the window while the word is well inside it', () => {
    expect(followIndex(win, 2500, 100_000)).toBe(win)
  })

  it('places it again near an edge, or outside', () => {
    expect(followIndex(win, 3900, 100_000)).toEqual(windowAround(3900, 100_000))
    expect(followIndex(win, 1100, 100_000)).toEqual(windowAround(1100, 100_000))
    expect(followIndex(win, 50_000, 100_000)).toEqual(windowAround(50_000, 100_000))
  })

  it('does not move for an edge that is the book’s own', () => {
    const whole = { start: 0, end: 300 }
    expect(followIndex(whole, 5, 300)).toBe(whole)
    expect(followIndex(whole, 299, 300)).toBe(whole)
  })
})

describe('grow', () => {
  it('adds words at the edge scrolled to', () => {
    expect(grow({ start: 1000, end: 4000 }, 'end', 100_000)).toEqual({
      start: 1000,
      end: 4000 + STEP,
    })
    expect(grow({ start: 1000, end: 4000 }, 'start', 100_000)).toEqual({ start: 0, end: 4000 })
  })

  it('trims the other edge to stay within MAX', () => {
    const big = { start: 0, end: MAX }
    expect(grow(big, 'end', 100_000)).toEqual({ start: STEP, end: MAX + STEP })
    expect(grow({ start: 10_000, end: 10_000 + MAX }, 'start', 100_000)).toEqual({
      start: 10_000 - STEP,
      end: 10_000 - STEP + MAX,
    })
  })

  it('stops at the book’s ends', () => {
    const win = { start: 0, end: 500 }
    expect(grow(win, 'start', 500)).toBe(win)
    expect(grow(win, 'end', 500)).toBe(win)
  })
})
