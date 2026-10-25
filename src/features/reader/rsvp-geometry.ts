// Where the RSVP word and its guide ticks sit, shared by the canvas that
// draws them and by the page overlay that must stay clear of them. One
// definition, so the reserved space cannot drift from what is drawn.

/** The RSVP canvas is never shorter than this; a shorter area just clips it. */
export const RSVP_MIN_HEIGHT = 200

/** The guide ticks start this far (times the font size) from the word's
 * centre line, and run `GUIDE_LENGTH` pixels further out. */
export const GUIDE_START = 0.75
export const GUIDE_LENGTH = 14

/** The size of the sentence line drawn under the word. */
export function contextFontSize(fontSizePx: number): number {
  return Math.max(13, Math.round(fontSizePx * 0.3))
}

/** Space between the guide line under the word and the sentence line. */
export const CONTEXT_GAP = 18

/** How far above and below the centre line the word, its guides and the
 * sentence line under it can reach. Kept symmetric, so the page overlay
 * reserves the same either side. (A long word is shrunk to fit the width,
 * never made taller.) */
export function wordZoneHalfHeight(fontSizePx: number): number {
  return fontSizePx * GUIDE_START + GUIDE_LENGTH + CONTEXT_GAP + contextFontSize(fontSizePx)
}

/** The word is drawn on this line: the middle of the canvas, which is at
 * least `RSVP_MIN_HEIGHT` tall. */
export function wordCenterY(areaHeight: number): number {
  return Math.max(RSVP_MIN_HEIGHT, areaHeight) / 2
}
