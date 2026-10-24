// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { openPdf, type PageWord } from '@/pdf/document'
import { screenToUserPoint, userBoxToScreen } from '@/pdf/geometry'
import { makePdf, type PageSpec } from './make-pdf'

// Books imported by the pdf.js-based versions kept each word's box in raw
// PDF user space ([x, y, x + width, y + height], y up, before any rotation
// or crop). The page view finds where that is drawn with the page's own
// transform. These pages are the ones where user space and the displayed
// page differ.

const pages: [string, PageSpec][] = [
  ['an ordinary page', {}],
  ['an offset media box', { mediaBox: [100, 200, 712, 992], at: [172, 900] }],
  ['a crop box', { cropBox: [50, 100, 562, 692], at: [100, 600] }],
  ['a page rotated 90°', { rotate: 90 }],
  ['a page rotated 180°', { rotate: 180 }],
  ['a page rotated 270°', { rotate: 270 }],
  [
    'a rotated page with an offset box',
    { mediaBox: [100, 200, 712, 992], rotate: 90, at: [172, 900] },
  ],
]

/** The box pdf.js stored for the first word, roughly: from the baseline
 * point up, as wide as MuPDF says the word is. */
function legacyBox(spec: PageSpec, word: PageWord): [number, number, number, number] {
  const [x, y] = spec.at ?? [72, 700]
  const size = spec.fontSize ?? 12
  const width = Math.hypot(word.x1 - word.x0, word.y1 - word.y0) // the word's length, however it is turned
  return [x, y, x + width, y + size]
}

const overlap = (a: { left: number; top: number; width: number; height: number }, b: PageWord) => {
  const ix = Math.max(0, Math.min(a.left + a.width, b.x1) - Math.max(a.left, b.x0))
  const iy = Math.max(0, Math.min(a.top + a.height, b.y1) - Math.max(a.top, b.y0))
  return (ix * iy) / (a.width * a.height)
}

describe.each(pages)('legacy boxes on %s', (_name, spec) => {
  async function firstWord() {
    const doc = await openPdf(makePdf(spec))
    const word = doc.lines(0)[0]?.words[0] as PageWord
    const size = doc.pageSize(0)
    doc.close()
    return { word, size }
  }

  it('land on the word, not off the page', async () => {
    const { word, size } = await firstWord()
    const rect = userBoxToScreen(legacyBox(spec, word), size.userToPage, 1)
    expect(rect.left).toBeGreaterThanOrEqual(0)
    expect(rect.top).toBeGreaterThanOrEqual(0)
    expect(rect.left + rect.width).toBeLessThanOrEqual(size.width + 1)
    expect(rect.top + rect.height).toBeLessThanOrEqual(size.height + 1)
    expect(overlap(rect, word)).toBeGreaterThan(0.5)
  })

  it('scale with the page', async () => {
    const { word, size } = await firstWord()
    const one = userBoxToScreen(legacyBox(spec, word), size.userToPage, 1)
    const two = userBoxToScreen(legacyBox(spec, word), size.userToPage, 2)
    expect(two.left).toBeCloseTo(one.left * 2)
    expect(two.top).toBeCloseTo(one.top * 2)
    expect(two.width).toBeCloseTo(one.width * 2)
  })

  it('can be clicked: a click on the word is a point inside the stored box', async () => {
    const { word, size } = await firstWord()
    const box = legacyBox(spec, word)
    const scale = 1.5
    const [x, y] = screenToUserPoint(
      ((word.x0 + word.x1) / 2) * scale,
      ((word.y0 + word.y1) / 2) * scale,
      size.userToPage,
      scale,
    )
    expect(x).toBeGreaterThanOrEqual(box[0] - 1)
    expect(x).toBeLessThanOrEqual(box[2] + 1)
    expect(y).toBeGreaterThanOrEqual(box[1] - 1)
    expect(y).toBeLessThanOrEqual(box[3] + 1)
  })
})

describe('the transform', () => {
  it('is the identity-with-a-flip for an ordinary page', async () => {
    const doc = await openPdf(makePdf())
    expect(doc.pageSize(0).userToPage).toEqual([1, 0, 0, -1, 0, 792])
    doc.close()
  })

  it('round-trips a point through screenToUserPoint', async () => {
    const doc = await openPdf(makePdf({ rotate: 90, mediaBox: [100, 200, 712, 992] }))
    const m = doc.pageSize(0).userToPage
    doc.close()
    const [ux, uy] = screenToUserPoint(
      m[0] * 300 + m[2] * 400 + m[4],
      m[1] * 300 + m[3] * 400 + m[5],
      m,
      1,
    )
    expect(ux).toBeCloseTo(300)
    expect(uy).toBeCloseTo(400)
  })
})
