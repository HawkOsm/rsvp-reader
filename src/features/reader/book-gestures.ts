// Touch gestures on a page in book mode, as plain arithmetic: what a finger
// movement means. The hook that listens for the touches is
// hooks/useBookGestures.ts.

/** A finger must travel this far sideways to turn the page. */
export const SWIPE_MIN_PX = 48
/** …in no longer than this: a slow drag is not a swipe. */
export const SWIPE_MAX_MS = 600
/** Two taps this close together, in time and place, are a double tap. */
export const DOUBLE_TAP_MS = 300
export const DOUBLE_TAP_PX = 30
/** A finger that moved less than this only tapped… */
export const TAP_SLOP_PX = 10
/** …if it lifted this soon: held longer, it is a long press, which selects
 * text. */
export const TAP_MAX_MS = 500
/** The share of the width, at each side, where a tap turns the page. */
export const TAP_EDGE = 0.3

export type TapZone = 'back' | 'middle' | 'forward'

/** What a tap `x` pixels into an area `width` wide is for: the left edge
 * goes back a page, the right edge onward, and the middle shows or hides
 * the controls (the zones of KOReader and Foliate, in thirds). */
export function tapZone(x: number, width: number): TapZone {
  if (width <= 0) return 'middle'
  const at = x / width
  if (at < TAP_EDGE) return 'back'
  return at > 1 - TAP_EDGE ? 'forward' : 'middle'
}

/** Which way a finger's movement turns the page: 1 for the next page (a
 * swipe to the left, as turning a paper page), -1 for the previous, `null`
 * if it wasn't a sideways swipe (too short, too slow, or mostly up or down,
 * which is scrolling). */
export function swipeTurn(dx: number, dy: number, ms: number): 1 | -1 | null {
  if (ms > SWIPE_MAX_MS) return null
  if (Math.abs(dx) < SWIPE_MIN_PX) return null
  if (Math.abs(dx) < 2 * Math.abs(dy)) return null
  return dx < 0 ? 1 : -1
}

/** Whether a tap follows the last one closely enough to be a double tap. */
export function isDoubleTap(
  last: { x: number; y: number; at: number } | null,
  tap: { x: number; y: number; at: number },
): boolean {
  if (!last) return false
  const near = Math.hypot(tap.x - last.x, tap.y - last.y) <= DOUBLE_TAP_PX
  return near && tap.at - last.at <= DOUBLE_TAP_MS
}

/** How much two fingers have spread or closed since they came down: the
 * ratio of the distances between them, kept so `scale × ratio` stays between
 * `min` and `max`. */
export function pinchRatio(
  startDistance: number,
  distance: number,
  scale: number,
  min: number,
  max: number,
): number {
  if (startDistance <= 0 || scale <= 0) return 1
  const ratio = distance / startDistance
  return Math.max(min / scale, Math.min(max / scale, ratio))
}
