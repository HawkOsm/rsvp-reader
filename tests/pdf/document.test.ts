// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ExtractionError } from '@/parse/errors'
import { isEngineUnsupported, MAX_PIXELS, openPdf } from '@/pdf/document'

const bytes = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}.pdf`))

describe('openPdf', () => {
  it('reports the page count, title and page size', async () => {
    const doc = await openPdf(bytes('two-column-text'))
    expect(doc.pageCount).toBe(3)
    expect(doc.title()).toBe('Two-Column Excerpt')
    expect(doc.pageSize(0)).toMatchObject({ width: 612, height: 792 })
    expect(doc.pageSize(0).userToPage).toEqual([1, 0, 0, -1, 0, 792]) // user space is y-up
    doc.close()
  })

  it('reads lines in MuPDF block order, with a box on every word', async () => {
    const doc = await openPdf(bytes('two-column-text'))
    const lines = doc.lines(0)
    expect(lines.length).toBeGreaterThan(50)
    expect(lines[0]?.words.map((w) => w.text).slice(0, 4)).toEqual(['The', 'Strange', 'Case', 'Of'])
    for (const line of lines) {
      for (const word of line.words) {
        expect(word.text).not.toMatch(/\s/)
        expect(word.x1).toBeGreaterThan(word.x0)
        expect(word.y1).toBeGreaterThan(word.y0)
        // y grows downwards from the top of the page.
        expect(word.y0).toBeGreaterThanOrEqual(0)
        expect(word.y1).toBeLessThanOrEqual(792)
      }
    }
    doc.close()
  })

  it('numbers blocks from zero and keeps a column in one block', async () => {
    const doc = await openPdf(bytes('two-column-text'))
    const blocks = new Set(doc.lines(0).map((l) => l.block))
    expect(blocks.size).toBe(2) // the two columns
    expect(Math.min(...blocks)).toBe(0)
    doc.close()
  })

  it('draws a page onto white at the size asked for', async () => {
    const doc = await openPdf(bytes('two-column-text'))
    const page = doc.render(0, 1)
    expect(page).toMatchObject({ width: 612, height: 792, scale: 1 })
    expect(page.rgba).toHaveLength(612 * 792 * 4)
    expect([...page.rgba.slice(0, 4)]).toEqual([255, 255, 255, 255]) // paper, fully opaque
    // ...and some ink somewhere.
    expect(page.rgba.some((value, i) => i % 4 === 0 && value < 128)).toBe(true)
    doc.close()
  })

  it('draws bigger when asked to', async () => {
    const doc = await openPdf(bytes('two-column-text'))
    const page = doc.render(0, 2)
    expect(page).toMatchObject({ width: 1224, height: 1584, scale: 2 })
    doc.close()
  })

  it('lowers the scale rather than make a bitmap too big for a phone', async () => {
    const doc = await openPdf(bytes('two-column-text'))
    const page = doc.render(0, 20)
    expect(page.scale).toBeLessThan(20)
    expect(page.width * page.height).toBeLessThanOrEqual(MAX_PIXELS)
    doc.close()
  })

  it('refuses to draw at a scale that is not a positive number', async () => {
    const doc = await openPdf(bytes('two-column-text'))
    for (const bad of [0, -1, NaN, Infinity]) expect(() => doc.render(0, bad)).toThrow(RangeError)
    doc.close()
  })

  it('rejects a page that is not there', async () => {
    const doc = await openPdf(bytes('two-column-text'))
    expect(() => doc.pageSize(3)).toThrow(RangeError)
    expect(() => doc.lines(-1)).toThrow(RangeError)
    expect(() => doc.render(1.5, 1)).toThrow(RangeError)
    doc.close()
  })

  it('refuses to be used once closed, and closing twice is harmless', async () => {
    const doc = await openPdf(bytes('two-column-text'))
    doc.close()
    doc.close()
    expect(() => doc.pageSize(0)).toThrow(/closed/)
  })

  it('explains a password-protected PDF', async () => {
    await expect(openPdf(bytes('password-protected'))).rejects.toThrow(/password protected/i)
    await expect(openPdf(bytes('password-protected'))).rejects.toBeInstanceOf(ExtractionError)
  })

  it('explains bytes that are not a PDF', async () => {
    await expect(openPdf(new TextEncoder().encode('not a pdf at all'))).rejects.toBeInstanceOf(
      ExtractionError,
    )
  })
})

describe('isEngineUnsupported', () => {
  it('recognises a browser that cannot compile the WebAssembly', () => {
    expect(isEngineUnsupported(new WebAssembly.CompileError('invalid opcode'))).toBe(true)
    expect(isEngineUnsupported(new WebAssembly.LinkError('bad import'))).toBe(true)
    expect(isEngineUnsupported(new Error('WebAssembly.instantiate(): expected magic word'))).toBe(
      true,
    )
  })

  it('does not blame the browser for other failures', () => {
    expect(isEngineUnsupported(new Error('Failed to fetch dynamically imported module'))).toBe(
      false,
    )
    expect(isEngineUnsupported(new TypeError('x is undefined'))).toBe(false)
    expect(isEngineUnsupported('WebAssembly')).toBe(false)
  })
})
