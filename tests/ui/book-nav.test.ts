import { describe, expect, it } from 'vitest'
import { createEngine } from '../../src/core/engine'
import { makeToken } from '../../src/core/types'
import {
  clampScale,
  firstIndexAt,
  fitScales,
  goToPage,
  pageLabel,
  spreadStart,
  turn,
  wordAt,
} from '../../src/ui/book-nav'

/** Two words on each of pages 0,1,2,4 — page 3 has no text (a blank page). */
function tokens() {
  return [0, 1, 2, 4].flatMap((page) => [
    makeToken(`p${page}a`, { page }),
    makeToken(`p${page}b`, { page }),
  ])
}

describe('spreadStart', () => {
  it('snaps to the left-hand page of a spread, or is the page itself when single', () => {
    expect(spreadStart(0, 'spread')).toBe(0)
    expect(spreadStart(3, 'spread')).toBe(2)
    expect(spreadStart(4, 'spread')).toBe(4)
    expect(spreadStart(3, 'single')).toBe(3)
  })
})

describe('firstIndexAt', () => {
  it('finds the first word of the page', () => {
    expect(firstIndexAt(tokens(), 2, 'single')).toBe(4)
  })

  it('looks at both pages of a spread', () => {
    // spread 2-3: page 2 has text, so it wins over the empty page 3
    expect(firstIndexAt(tokens(), 2, 'spread')).toBe(4)
  })

  it('falls back to the nearest page that has text', () => {
    expect(firstIndexAt(tokens(), 3, 'single')).toBe(4) // pages 2 and 4 are equally near; the earlier one wins
  })
})

describe('turn / goToPage', () => {
  it('turns a single page forward and back by moving the engine to its first word', () => {
    const engine = createEngine(tokens())
    turn(engine, 5, 'single', 1)
    expect(engine.index).toBe(2) // first word of page 1
    turn(engine, 5, 'single', -1)
    expect(engine.index).toBe(0)
  })

  it('turns a spread two pages at a time', () => {
    const engine = createEngine(tokens())
    turn(engine, 5, 'spread', 1)
    expect(engine.index).toBe(4) // spread 2-3 -> first word on page 2
  })

  it('does nothing at the first page', () => {
    const engine = createEngine(tokens(), { index: 1 })
    turn(engine, 5, 'single', -1)
    expect(engine.index).toBe(1)
  })

  it('does nothing when asked for the spread already showing', () => {
    const engine = createEngine(tokens(), { index: 3 })
    goToPage(engine, 5, 'spread', 1) // page 1 is in spread 0-1, where index 3 already is
    expect(engine.index).toBe(3)
  })

  it('clamps past the last page', () => {
    const engine = createEngine(tokens())
    goToPage(engine, 5, 'single', 99)
    expect(engine.index).toBe(6) // page 4
  })
})

describe('pageLabel', () => {
  it('names one page or a pair', () => {
    expect(pageLabel(0, 4, 'single')).toBe('page 1 / 4')
    expect(pageLabel(0, 4, 'spread')).toBe('pages 1–2 / 4')
    expect(pageLabel(3, 4, 'spread')).toBe('pages 3–4 / 4')
    // an odd page count leaves the last spread with a single page
    expect(pageLabel(4, 5, 'spread')).toBe('page 5 / 5')
    expect(pageLabel(0, 0, 'spread')).toBe('—')
  })
})

describe('wordAt', () => {
  const words = [
    makeToken('one', { page: 0, bbox: [10, 100, 40, 112] }),
    makeToken('two', { page: 0, bbox: [50, 100, 80, 112] }),
    makeToken('three', { page: 1, bbox: [10, 100, 60, 112] }),
  ]

  it('picks the word under the point', () => {
    expect(wordAt(words, 0, 60, 105)).toBe(1)
  })

  it('reaches a few points past a word, but not far', () => {
    expect(wordAt(words, 0, 44, 105)).toBe(0) // 4pt right of "one"
    expect(wordAt(words, 0, 300, 400)).toBeNull()
  })

  it('only looks at words on the given page', () => {
    expect(wordAt(words, 1, 20, 105)).toBe(2)
    expect(wordAt(words, 1, 60, 105)).toBe(2)
  })

  it('takes a box whose y runs the other way', () => {
    const flipped = [makeToken('up', { page: 0, bbox: [10, 112, 40, 100] })]
    expect(wordAt(flipped, 0, 20, 105)).toBe(0)
  })
})

describe('clampScale', () => {
  it('keeps the page size within 25%–500% and on whole percents', () => {
    expect(clampScale(0.1)).toBe(0.25)
    expect(clampScale(9)).toBe(5)
    expect(clampScale(1 + 0.1 + 0.1)).toBe(1.2) // 1.2000000000000002 without rounding
  })
})

describe('fitScales', () => {
  const letter = { width: 612, height: 792 }

  it('fits a single page to the width, or to the whole page when height is tighter', () => {
    // 1024 wide: (1024 - 16) / 612 = 1.647 -> 1.64; 700 tall: (700 - 16) / 792 = 0.863 -> 0.86
    const fit = fitScales([letter], { width: 1024, height: 700 })
    expect(fit.width).toBe(1.64)
    expect(fit.page).toBe(0.86)
  })

  it('has the page fit equal the width fit when the window is tall enough', () => {
    const fit = fitScales([letter], { width: 400, height: 2000 })
    expect(fit.page).toBe(fit.width)
  })

  it('splits the width between the pages of a spread, minus the gutter', () => {
    // (1000 - 16 - 38) / (2 * 612) = 0.7729 -> 0.77
    expect(fitScales([letter, letter], { width: 1000, height: 5000 }).width).toBe(0.77)
  })

  it('sizes to the widest and tallest page in the spread', () => {
    const wide = { width: 900, height: 500 }
    expect(fitScales([letter, wide], { width: 2000, height: 5000 }).width).toBe(
      fitScales([wide, wide], { width: 2000, height: 5000 }).width,
    )
  })
})
