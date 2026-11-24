import { describe, expect, it } from 'vitest'
import { isDoubleTap, pinchRatio, swipeTurn, tapZone } from '@/features/reader/book-gestures'

describe('book mode touch gestures', () => {
  it('turns forward on a swipe to the left, back on one to the right', () => {
    expect(swipeTurn(-120, 10, 200)).toBe(1)
    expect(swipeTurn(120, -10, 200)).toBe(-1)
  })

  it('ignores a short, slow or mostly vertical movement', () => {
    expect(swipeTurn(-30, 0, 100)).toBeNull() // too short
    expect(swipeTurn(-200, 0, 900)).toBeNull() // too slow: a drag
    expect(swipeTurn(-80, 60, 200)).toBeNull() // scrolling, on a slant
    expect(swipeTurn(0, 300, 200)).toBeNull()
  })

  it('takes two quick taps in the same place as a double tap', () => {
    const first = { x: 100, y: 200, at: 1000 }
    expect(isDoubleTap(null, first)).toBe(false)
    expect(isDoubleTap(first, { x: 110, y: 205, at: 1200 })).toBe(true)
    expect(isDoubleTap(first, { x: 110, y: 205, at: 1500 })).toBe(false) // too late
    expect(isDoubleTap(first, { x: 220, y: 200, at: 1100 })).toBe(false) // elsewhere
  })

  it('zooms by how far two fingers spread, within the limits', () => {
    expect(pinchRatio(100, 200, 1, 0.5, 5)).toBe(2)
    expect(pinchRatio(200, 100, 1, 0.5, 5)).toBe(0.5)
    expect(pinchRatio(100, 1000, 1, 0.5, 5)).toBe(5) // no further than the largest
    expect(pinchRatio(100, 10, 1, 0.5, 5)).toBe(0.5) // nor smaller than the whole page
    expect(pinchRatio(0, 100, 1, 0.5, 5)).toBe(1)
  })

  it('reads a tap at an edge as a page turn, in the middle as a call for the controls', () => {
    expect(tapZone(10, 400)).toBe('back')
    expect(tapZone(119, 400)).toBe('back')
    expect(tapZone(121, 400)).toBe('middle')
    expect(tapZone(279, 400)).toBe('middle')
    expect(tapZone(281, 400)).toBe('forward')
    expect(tapZone(50, 0)).toBe('middle') // nothing laid out yet
  })
})
