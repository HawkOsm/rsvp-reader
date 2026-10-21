import { ExtractionError } from '../parse/errors'

// The only module that talks to MuPDF. Everything else (extraction, the
// worker, the page view) goes through `PdfDocument`, so swapping or
// upgrading the engine touches this file alone.
//
// Coordinates here are MuPDF's own: PDF points, origin at the top-left of
// the page as displayed (rotation applied), y growing downwards. That is
// what the screen wants. `Token.bbox` is the other convention (y up) and
// is converted in `geometry.ts`, not here.

/** [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Matrix = [number, number, number, number, number, number]

export interface PageSize {
  width: number
  height: number
  /** Takes a point in the page's own PDF user space to the displayed page
   * (top-left origin, y down, rotation and crop applied). Only needed to
   * place boxes that were stored in user space by older versions. */
  userToPage: Matrix
}

export interface PageWord {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

/** One line of text as MuPDF found it. `block` groups lines the way MuPDF
 * groups them into paragraphs/columns; the numbers only mean anything
 * within one page. */
export interface PageLine {
  block: number
  /** Baseline y, from the top of the page. */
  baseline: number
  words: PageWord[]
}

export interface RenderedPage {
  /** Pixel size of `rgba`; can be smaller than asked for, see `MAX_PIXELS`. */
  width: number
  height: number
  /** The scale that was actually used. */
  scale: number
  rgba: Uint8ClampedArray<ArrayBuffer>
}

export interface PdfDocument {
  readonly pageCount: number
  /** The document's own title metadata, if it has one. */
  title(): string | undefined
  pageSize(page: number): PageSize
  /** Lines in MuPDF's reading order. */
  lines(page: number): PageLine[]
  /** Draw the page onto a white background at `scale` (1 = 72 dpi). */
  render(page: number, scale: number): RenderedPage
  close(): void
}

/** Largest bitmap `render` will produce. Past this a phone's canvas fails
 * (or the tab dies), so the scale is lowered to fit instead. */
export const MAX_PIXELS = 16_000_000

const ENGINE_UNSUPPORTED =
  'This browser is too old to open PDFs. Update it (Chrome or Android WebView 95, ' +
  'Safari 15.2 or Firefox 100 or newer) and try again.'

/** MuPDF's WebAssembly uses exception handling, which older engines
 * reject when they compile it. */
export function isEngineUnsupported(error: unknown): boolean {
  return (
    error instanceof WebAssembly.CompileError ||
    error instanceof WebAssembly.LinkError ||
    (error instanceof Error && /webassembly/i.test(error.message))
  )
}

type MuPdf = typeof import('mupdf')

export async function openPdf(data: Uint8Array): Promise<PdfDocument> {
  // Loaded here, not at the top of the file: importing `mupdf` starts
  // compiling a ~10 MB WebAssembly module, which a text-only session
  // should never pay for.
  let mupdf: MuPdf
  try {
    mupdf = await import('mupdf')
  } catch (error) {
    if (isEngineUnsupported(error)) throw new ExtractionError(ENGINE_UNSUPPORTED)
    throw error
  }

  let doc: ReturnType<MuPdf['Document']['openDocument']>
  try {
    doc = mupdf.Document.openDocument(data, 'application/pdf')
  } catch (error) {
    throw new ExtractionError(`Could not open PDF: ${(error as Error).message}`)
  }
  if (doc.needsPassword()) {
    doc.destroy()
    throw new ExtractionError('This PDF is password protected.')
  }

  const pageCount = doc.countPages()
  let closed = false

  function withPage<T>(index: number, read: (page: ReturnType<typeof doc.loadPage>) => T): T {
    if (closed) throw new Error('The PDF is closed.')
    if (!Number.isInteger(index) || index < 0 || index >= pageCount) {
      throw new RangeError(`No page ${index} in a ${pageCount}-page PDF.`)
    }
    const page = doc.loadPage(index)
    try {
      return read(page)
    } finally {
      page.destroy()
    }
  }

  return {
    pageCount,

    title() {
      try {
        return doc.getMetaData('info:Title') || undefined
      } catch {
        return undefined
      }
    },

    pageSize(index) {
      return withPage(index, (page) => {
        const [x0, y0, x1, y1] = page.getBounds()
        const userToPage: Matrix =
          'getTransform' in page ? page.getTransform() : [1, 0, 0, -1, 0, y1 - y0]
        return { width: x1 - x0, height: y1 - y0, userToPage }
      })
    },

    lines(index) {
      return withPage(index, (page) => {
        const [originX, originY] = page.getBounds()
        const text = page.toStructuredText('preserve-whitespace')
        try {
          return collectLines(text, originX, originY)
        } finally {
          text.destroy()
        }
      })
    },

    render(index, scale) {
      if (!Number.isFinite(scale) || scale <= 0) throw new RangeError(`Cannot draw at scale ${scale}.`)
      return withPage(index, (page) => {
        const [x0, y0, x1, y1] = page.getBounds()
        const width = x1 - x0
        const height = y1 - y0
        // MuPDF rounds a bitmap's size up to whole pixels, so shrink until
        // the rounded size fits, not just the exact one.
        let used = scale
        while (Math.ceil(width * used) * Math.ceil(height * used) > MAX_PIXELS) used *= 0.995
        const pixmap = page.toPixmap(
          mupdf.Matrix.scale(used, used),
          mupdf.ColorSpace.DeviceRGB,
          false,
          true,
        )
        try {
          return {
            width: pixmap.getWidth(),
            height: pixmap.getHeight(),
            scale: used,
            rgba: rgbToRgba(pixmap.getPixels(), pixmap.getWidth(), pixmap.getHeight(), pixmap.getStride()),
          }
        } finally {
          pixmap.destroy()
        }
      })
    },

    close() {
      if (closed) return
      closed = true
      doc.destroy()
    },
  }
}

/** MuPDF hands back 3 bytes a pixel; canvas `ImageData` wants 4. */
function rgbToRgba(
  rgb: Uint8ClampedArray,
  width: number,
  height: number,
  stride: number,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4)
  let to = 0
  for (let y = 0; y < height; y++) {
    let from = y * stride
    for (let x = 0; x < width; x++) {
      out[to++] = rgb[from++] as number
      out[to++] = rgb[from++] as number
      out[to++] = rgb[from++] as number
      out[to++] = 255
    }
  }
  return out
}

function collectLines(
  text: InstanceType<MuPdf['StructuredText']>,
  originX: number,
  originY: number,
): PageLine[] {
  const lines: PageLine[] = []
  let block = -1
  let words: PageWord[] = []
  let word: PageWord | null = null
  let baseline = 0
  let firstChar = true

  const endWord = () => {
    if (word) words.push(word)
    word = null
  }

  text.walk({
    beginTextBlock() {
      block++
    },
    beginLine() {
      words = []
      word = null
      firstChar = true
    },
    onChar(c, origin, _font, _size, quad) {
      if (firstChar) {
        baseline = origin[1] - originY
        firstChar = false
      }
      if (c.trim() === '') {
        endWord()
        return
      }
      // A quad is four corners as x,y pairs; rotated text makes it a
      // diamond, so take the box that holds all four.
      let x0 = Infinity
      let x1 = -Infinity
      let y0 = Infinity
      let y1 = -Infinity
      for (let i = 0; i < 8; i += 2) {
        x0 = Math.min(x0, quad[i] as number)
        x1 = Math.max(x1, quad[i] as number)
        y0 = Math.min(y0, quad[i + 1] as number)
        y1 = Math.max(y1, quad[i + 1] as number)
      }
      x0 -= originX
      x1 -= originX
      y0 -= originY
      y1 -= originY
      if (word) {
        word.text += c
        word.x0 = Math.min(word.x0, x0)
        word.x1 = Math.max(word.x1, x1)
        word.y0 = Math.min(word.y0, y0)
        word.y1 = Math.max(word.y1, y1)
      } else {
        word = { text: c, x0, y0, x1, y1 }
      }
    },
    endLine() {
      endWord()
      if (words.length > 0) lines.push({ block, baseline, words })
    },
  })
  return lines
}
