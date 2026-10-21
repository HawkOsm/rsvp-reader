import { describe, expect, it } from 'vitest'
import { screenToTokenPoint, tokenBoxToScreen, wordToTokenBox } from '../../src/pdf/geometry'

const PAGE_HEIGHT = 800

describe('wordToTokenBox', () => {
  it('flips a top-left, y-down word box to PDF space (origin bottom-left, y up)', () => {
    // 100pt from the top, 12pt tall.
    const word = { text: 'w', x0: 50, y0: 100, x1: 80, y1: 112 }
    expect(wordToTokenBox(word, PAGE_HEIGHT)).toEqual([50, 688, 80, 700])
  })

  it('keeps y0 below y1, so the box is never upside down', () => {
    const [, y0, , y1] = wordToTokenBox({ text: 'w', x0: 0, y0: 10, x1: 5, y1: 20 }, PAGE_HEIGHT)
    expect(y0).toBeLessThan(y1)
  })
})

describe('tokenBoxToScreen', () => {
  it('puts a word near the top of the page near the top of the screen', () => {
    const rect = tokenBoxToScreen([50, 688, 80, 700], PAGE_HEIGHT, 1)
    expect(rect).toEqual({ left: 50, top: 100, width: 30, height: 12 })
  })

  it('scales every dimension', () => {
    const rect = tokenBoxToScreen([50, 688, 80, 700], PAGE_HEIGHT, 2)
    expect(rect).toEqual({ left: 100, top: 200, width: 60, height: 24 })
  })

  it('is the inverse of wordToTokenBox', () => {
    const word = { text: 'w', x0: 31, y0: 417, x1: 90, y1: 431 }
    const rect = tokenBoxToScreen(wordToTokenBox(word, PAGE_HEIGHT), PAGE_HEIGHT, 1.5)
    expect(rect.left).toBeCloseTo(word.x0 * 1.5)
    expect(rect.top).toBeCloseTo(word.y0 * 1.5)
    expect(rect.width).toBeCloseTo((word.x1 - word.x0) * 1.5)
    expect(rect.height).toBeCloseTo((word.y1 - word.y0) * 1.5)
  })

  it('copes with a box whose corners are given the other way round', () => {
    const rect = tokenBoxToScreen([80, 700, 50, 688], PAGE_HEIGHT, 1)
    expect(rect).toEqual({ left: 50, top: 100, width: 30, height: 12 })
  })
})

describe('screenToTokenPoint', () => {
  it('is the inverse of tokenBoxToScreen for a point', () => {
    const rect = tokenBoxToScreen([50, 688, 80, 700], PAGE_HEIGHT, 2)
    const [x, y] = screenToTokenPoint(rect.left, rect.top + rect.height, PAGE_HEIGHT, 2)
    expect(x).toBeCloseTo(50)
    expect(y).toBeCloseTo(688) // the bottom edge, in PDF's y-up space
  })

  it('maps the top-left of the screen to the top-left of the PDF page', () => {
    expect(screenToTokenPoint(0, 0, PAGE_HEIGHT, 1)).toEqual([0, PAGE_HEIGHT])
  })
})
