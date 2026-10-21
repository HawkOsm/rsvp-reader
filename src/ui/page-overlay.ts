import { wordCenterY, wordZoneHalfHeight } from './rsvp-geometry'

// The page you are reading from, shown over the reading area instead of
// beside it. Splitting the screen squeezed the word on a phone; an overlay
// leaves the word exactly where it is. Its one rule: it never covers the
// word, however long, with room to breathe between them.

export interface Size {
  width: number
  height: number
}

export interface OverlayBox {
  top: number
  left: number
  width: number
  height: number
}

/** Space kept between the word's zone and the page, so the eye can rest. */
export function breathingSpace(fontSizePx: number): number {
  return Math.min(48, Math.max(20, Math.round(fontSizePx * 0.5)))
}

/** Space kept between the page and the edge of the reading area. */
const EDGE = 8

/** Below this a page is not worth showing: not enough to read. */
export const MIN_OVERLAY_HEIGHT = 140

/** On a wide screen the page does not stretch to fill it. */
export const MAX_OVERLAY_WIDTH = 560

/**
 * Where the page overlay goes in a reading area of this size, or `null` if
 * there is no room for it without covering the word.
 *
 * The word sits on a full-width band across the middle of the area (a long
 * word is shrunk to fit the width, so it can never leave the band). The
 * overlay takes whichever of the strips above and below the band, plus
 * breathing space, is taller, preferring above, in the top-right corner.
 */
export function pageOverlayBox(area: Size, fontSizePx: number): OverlayBox | null {
  const centre = wordCenterY(area.height)
  const half = wordZoneHalfHeight(fontSizePx)
  const gap = breathingSpace(fontSizePx)

  const aboveHeight = centre - half - gap - EDGE
  const belowTop = centre + half + gap
  const belowHeight = area.height - belowTop - EDGE

  const below = belowHeight > aboveHeight // above unless below is clearly taller
  const height = Math.floor(below ? belowHeight : aboveHeight)
  if (height < MIN_OVERLAY_HEIGHT) return null

  const width = Math.floor(Math.min(area.width - 2 * EDGE, MAX_OVERLAY_WIDTH))
  if (width <= 0) return null
  return {
    top: below ? Math.ceil(belowTop) : EDGE,
    left: area.width - width - EDGE, // the right-hand corner
    width,
    height,
  }
}

/** Narrowest area worth docking the page beside the word in. */
const MIN_SIDE_AREA_WIDTH = 600
const MAX_SIDE_WIDTH = 440

export interface PagePlacement {
  box: OverlayBox
  /** Room to take from the right of the word display, so the word is
   * narrowed to fit beside the page instead of being covered by it. */
  insetRight: number
}

/**
 * Where the page goes: floating above (or below) the word if there is room,
 * otherwise, in a wide window too short for that, docked down the right-hand
 * side with the word display narrowed to make room. `null` only when there is
 * no room either way.
 */
export function pagePlacement(area: Size, fontSizePx: number): PagePlacement | null {
  const floating = pageOverlayBox(area, fontSizePx)
  if (floating) return { box: floating, insetRight: 0 }

  if (area.width < MIN_SIDE_AREA_WIDTH || area.height < MIN_OVERLAY_HEIGHT + 2 * EDGE) return null
  const width = Math.min(MAX_SIDE_WIDTH, Math.floor(area.width * 0.42))
  return {
    box: { top: EDGE, left: area.width - width - EDGE, width, height: area.height - 2 * EDGE },
    insetRight: width + 2 * EDGE,
  }
}
