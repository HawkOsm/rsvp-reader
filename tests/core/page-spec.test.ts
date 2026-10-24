import { describe, expect, it } from 'vitest'
import { aspectOf, DEFAULT_PAGE, makePageSpec, PAGE_PRESETS, resolvePage } from '@/core/page-spec'

describe('page spec', () => {
  it('is frozen, so it cannot change after it is scanned', () => {
    const page = makePageSpec(612, 792)
    expect(Object.isFrozen(page)).toBe(true)
    expect(Object.isFrozen(DEFAULT_PAGE)).toBe(true)
    expect(() => {
      ;(page as { width: number }).width = 1
    }).toThrow()
  })

  it('falls back to the default for a size that makes no sense', () => {
    for (const [w, h] of [
      [0, 792],
      [612, -1],
      [NaN, 5],
      [Infinity, 5],
    ]) {
      expect(makePageSpec(w as number, h as number)).toBe(DEFAULT_PAGE)
    }
  })

  it('has named presets, and the default is one of them', () => {
    expect(PAGE_PRESETS.letter).toEqual({ width: 612, height: 792 })
    expect(DEFAULT_PAGE).toEqual(PAGE_PRESETS.book)
  })

  it('gives the shape of a page', () => {
    expect(aspectOf(PAGE_PRESETS.letter)).toBeCloseTo(0.773, 2)
  })

  it('is read through the API, defaulting when there is none', () => {
    expect(resolvePage({ width: 500, height: 700 })).toEqual({ width: 500, height: 700 })
    expect(Object.isFrozen(resolvePage({ width: 500, height: 700 }))).toBe(true)
    expect(resolvePage(undefined)).toBe(DEFAULT_PAGE)
    expect(resolvePage(null)).toBe(DEFAULT_PAGE)
  })
})
