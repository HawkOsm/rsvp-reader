import { describe, expect, it } from 'vitest'
import { sortReadingOrder } from '../../../src/parse/pdf/columns'
import type { RawLine } from '../../../src/parse/pdf/types'

function line(text: string, x0: number, y: number): RawLine {
  return { page: 0, x0, y, words: [{ text, page: 0, bbox: [x0, y, x0 + 40, y + 12] }] }
}

describe('sortReadingOrder', () => {
  it('reads a whole left column before the right column, not top-to-bottom across both', () => {
    const pageWidth = 612 // US Letter, points
    // Interleaved as raw extraction order might produce: alternating
    // between the two columns by absolute y position.
    const lines = [
      line('right-1', 350, 700),
      line('left-1', 50, 700),
      line('right-2', 350, 680),
      line('left-2', 50, 680),
      line('right-3', 350, 660),
      line('left-3', 50, 660),
    ]

    const ordered = sortReadingOrder(lines, pageWidth)
    expect(ordered.map((l) => l.words[0]?.text)).toEqual([
      'left-1',
      'left-2',
      'left-3',
      'right-1',
      'right-2',
      'right-3',
    ])
  })

  it('falls back to plain top-to-bottom for a single-column page', () => {
    const lines = [line('b', 72, 680), line('a', 72, 700), line('c', 72, 660)]
    const ordered = sortReadingOrder(lines, 612)
    expect(ordered.map((l) => l.words[0]?.text)).toEqual(['a', 'b', 'c'])
  })

  it('is a no-op on an empty page', () => {
    expect(sortReadingOrder([], 612)).toEqual([])
  })

  it('treats small indentation differences as the same column, not separate ones', () => {
    // A first-line paragraph indent (~20pt) should not be mistaken for a
    // second column on a 612pt-wide page.
    const lines = [line('normal', 72, 700), line('indented', 92, 680)]
    const ordered = sortReadingOrder(lines, 612)
    expect(ordered.map((l) => l.words[0]?.text)).toEqual(['normal', 'indented'])
  })
})
