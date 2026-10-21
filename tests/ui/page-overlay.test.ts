import { describe, expect, it } from 'vitest'
import {
  breathingSpace,
  MAX_OVERLAY_WIDTH,
  MIN_OVERLAY_HEIGHT,
  pageOverlayBox,
  type OverlayBox,
} from '../../src/ui/page-overlay'
import { RSVP_MIN_HEIGHT, wordCenterY, wordZoneHalfHeight } from '../../src/ui/rsvp-geometry'

/** The strip the word and its guide ticks can occupy. */
function zone(areaHeight: number, fontSize: number) {
  const centre = wordCenterY(areaHeight)
  const half = wordZoneHalfHeight(fontSize)
  return { top: centre - half, bottom: centre + half }
}

const clearOfWord = (box: OverlayBox, area: { height: number }, fontSize: number) => {
  const z = zone(area.height, fontSize)
  const gap = breathingSpace(fontSize)
  const above = box.top + box.height <= z.top - gap
  const below = box.top >= z.bottom + gap
  return above || below
}

describe('where the word is', () => {
  it('is on the middle line of an area at least as tall as the canvas', () => {
    expect(wordCenterY(800)).toBe(400)
    expect(wordCenterY(RSVP_MIN_HEIGHT)).toBe(100)
  })

  it('stays on the canvas middle when the area is shorter than the canvas', () => {
    // The canvas does not shrink below its minimum, so neither does the line.
    expect(wordCenterY(120)).toBe(100)
  })

  it('reaches further the bigger the text is', () => {
    expect(wordZoneHalfHeight(96)).toBeGreaterThan(wordZoneHalfHeight(28))
  })
})

describe('pageOverlayBox on a phone held upright', () => {
  const phone = { width: 375, height: 640 }
  const box = pageOverlayBox(phone, 56) as OverlayBox

  it('fits, below the word', () => {
    expect(box).not.toBeNull()
    expect(box.top).toBeGreaterThan(phone.height / 2)
  })

  it('keeps off the word with room to spare', () => {
    expect(clearOfWord(box, phone, 56)).toBe(true)
    const z = zone(phone.height, 56)
    expect(box.top - z.bottom).toBeGreaterThanOrEqual(breathingSpace(56))
  })

  it('stays inside the area, a little in from the edges', () => {
    expect(box.left).toBeGreaterThan(0)
    expect(box.left + box.width).toBeLessThan(phone.width)
    expect(box.top + box.height).toBeLessThan(phone.height)
  })

  it('uses nearly the whole width', () => {
    expect(box.width).toBeGreaterThan(phone.width - 24)
  })
})

describe('pageOverlayBox on a computer screen', () => {
  const desktop = { width: 1440, height: 760 }
  const box = pageOverlayBox(desktop, 56) as OverlayBox

  it('does not stretch the page across the whole width', () => {
    expect(box.width).toBe(MAX_OVERLAY_WIDTH)
  })

  it('centres it, clear of the word', () => {
    expect(box.left).toBe((desktop.width - MAX_OVERLAY_WIDTH) / 2)
    expect(clearOfWord(box, desktop, 56)).toBe(true)
  })
})

describe('pageOverlayBox when there is no room', () => {
  it('gives none on a phone turned sideways, rather than cover the word', () => {
    expect(pageOverlayBox({ width: 740, height: 230 }, 56)).toBeNull()
  })

  it('gives none when the area is not yet measured to anything', () => {
    expect(pageOverlayBox({ width: 0, height: 0 }, 56)).toBeNull()
  })

  it('has room again with smaller text', () => {
    const area = { width: 740, height: 420 }
    expect(pageOverlayBox(area, 96)).toBeNull()
    expect(pageOverlayBox(area, 28)).not.toBeNull()
  })

  it('never offers less than a readable height', () => {
    const box = pageOverlayBox({ width: 800, height: 600 }, 28)
    expect(box?.height).toBeGreaterThanOrEqual(MIN_OVERLAY_HEIGHT)
  })
})

describe('pageOverlayBox: it never covers the word, whatever the screen and text size', () => {
  it('for every size tried', () => {
    let fitted = 0
    let none = 0
    for (let width = 240; width <= 2000; width += 40) {
      for (let height = 100; height <= 1400; height += 20) {
        for (const fontSize of [28, 40, 56, 72, 96]) {
          const area = { width, height }
          const box = pageOverlayBox(area, fontSize)
          if (!box) {
            none++
            continue
          }
          fitted++
          expect(box.height).toBeGreaterThanOrEqual(MIN_OVERLAY_HEIGHT)
          expect(box.width).toBeGreaterThan(0)
          expect(box.width).toBeLessThanOrEqual(MAX_OVERLAY_WIDTH)
          expect(box.left).toBeGreaterThanOrEqual(0)
          expect(box.left + box.width).toBeLessThanOrEqual(width)
          expect(box.top).toBeGreaterThanOrEqual(0)
          // inside the area, unless the area is shorter than the canvas that clips it
          if (height >= RSVP_MIN_HEIGHT) expect(box.top + box.height).toBeLessThanOrEqual(height)
          if (!clearOfWord(box, area, fontSize)) {
            throw new Error(`covers the word at ${width}x${height}, text ${fontSize}px: ${JSON.stringify(box)}`)
          }
        }
      }
    }
    expect(fitted).toBeGreaterThan(1000) // the sweep really did place a lot of them
    expect(none).toBeGreaterThan(100) // ...and really did refuse some
  })

  it('prefers below, but takes above when that is the taller strip', () => {
    // Taller than the canvas minimum: both strips are the same, so below wins.
    const even = pageOverlayBox({ width: 400, height: 700 }, 56) as OverlayBox
    expect(even.top).toBeGreaterThan(700 / 2)
  })
})

describe('breathingSpace', () => {
  it('grows with the text, within limits', () => {
    expect(breathingSpace(28)).toBe(20)
    expect(breathingSpace(56)).toBe(28)
    expect(breathingSpace(96)).toBe(48)
    expect(breathingSpace(200)).toBe(48)
  })
})
