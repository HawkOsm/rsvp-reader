import type { Matrix, PageWord } from './document'

// Two coordinate systems meet here. MuPDF and the screen put the origin at
// the top-left with y growing down. `Token.bbox` (stored in every saved
// book) uses PDF's own convention: origin at the bottom-left, y growing up.
// Every conversion between them lives in this file, so the flip happens in
// one place and is tested once.

export type Box = [x0: number, y0: number, x1: number, y1: number]

/** A word's box in `Token.bbox`'s convention. */
export function wordToTokenBox(word: PageWord, pageHeight: number): Box {
  return [word.x0, pageHeight - word.y1, word.x1, pageHeight - word.y0]
}

export interface ScreenRect {
  left: number
  top: number
  width: number
  height: number
}

/** Where a `Token.bbox` falls on a page drawn at `scale`. */
export function tokenBoxToScreen(box: Box, pageHeight: number, scale: number): ScreenRect {
  const [x0, y0, x1, y1] = box
  const left = Math.min(x0, x1) * scale
  const right = Math.max(x0, x1) * scale
  const top = (pageHeight - Math.max(y0, y1)) * scale
  const bottom = (pageHeight - Math.min(y0, y1)) * scale
  return { left, top, width: right - left, height: bottom - top }
}

/** A point on the drawn page (CSS pixels from its top-left) as a PDF point
 * in `Token.bbox`'s convention. */
export function screenToTokenPoint(
  x: number,
  y: number,
  pageHeight: number,
  scale: number,
): [number, number] {
  return [x / scale, pageHeight - y / scale]
}

// Books imported before MuPDF stored boxes in raw PDF user space. Where one
// is drawn depends on the page's rotation and box, which `userToPage`
// (from the worker) carries.

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

/** Where a box stored in PDF user space falls on a page drawn at `scale`. */
export function userBoxToScreen(box: Box, userToPage: Matrix, scale: number): ScreenRect {
  const [x0, y0, x1, y1] = box
  const corners = [apply(userToPage, x0, y0), apply(userToPage, x1, y1)]
  const xs = corners.map(([x]) => x as number)
  const ys = corners.map(([, y]) => y as number)
  const left = Math.min(...xs) * scale
  const top = Math.min(...ys) * scale
  return {
    left,
    top,
    width: Math.max(...xs) * scale - left,
    height: Math.max(...ys) * scale - top,
  }
}

/** A point on the drawn page (CSS pixels from its top-left) as a point in
 * PDF user space: what a legacy box is compared against. */
export function screenToUserPoint(
  x: number,
  y: number,
  userToPage: Matrix,
  scale: number,
): [number, number] {
  const [a, b, c, d, e, f] = userToPage
  const px = x / scale - e
  const py = y / scale - f
  const det = a * d - b * c
  return [(d * px - c * py) / det, (a * py - b * px) / det]
}
