// @vitest-environment node
import { readFileSync } from 'node:fs'
import * as mupdf from 'mupdf'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openPdf } from '@/pdf/document'

// MuPDF's objects live in WebAssembly memory, which the garbage collector
// never feels pressure from, so every one must be destroyed by hand. These
// count the destroys.

const bytes = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}.pdf`))

const spies = () => ({
  page: vi.spyOn(mupdf.PDFPage.prototype, 'destroy'),
  text: vi.spyOn(mupdf.StructuredText.prototype, 'destroy'),
  pixmap: vi.spyOn(mupdf.Pixmap.prototype, 'destroy'),
  document: vi.spyOn(mupdf.PDFDocument.prototype, 'destroy'),
})

afterEach(() => vi.restoreAllMocks())

describe('freeing MuPDF objects', () => {
  it('frees the page after asking its size', async () => {
    const doc = await openPdf(bytes('two-column-text'))
    const s = spies()
    doc.pageSize(0)
    expect(s.page).toHaveBeenCalledTimes(1)
    doc.close()
  })

  it('frees the page and its text after reading the lines', async () => {
    const doc = await openPdf(bytes('two-column-text'))
    const s = spies()
    doc.lines(0)
    expect(s.page).toHaveBeenCalledTimes(1)
    expect(s.text).toHaveBeenCalledTimes(1)
    doc.close()
  })

  it('frees the page and the bitmap after drawing', async () => {
    const doc = await openPdf(bytes('two-column-text'))
    const s = spies()
    doc.render(0, 0.5)
    expect(s.page).toHaveBeenCalledTimes(1)
    expect(s.pixmap).toHaveBeenCalledTimes(1)
    doc.close()
  })

  it('frees them even when the call fails part-way', async () => {
    const doc = await openPdf(bytes('two-column-text'))
    const s = spies()
    expect(() => doc.render(0, 1e9)).not.toThrow() // clamped, so it still draws
    expect(s.pixmap).toHaveBeenCalledTimes(1)
    expect(() => doc.lines(7)).toThrow(RangeError) // no page to load, so nothing to free
    expect(s.page).toHaveBeenCalledTimes(1)
    doc.close()
  })

  it('frees the document once, however many times it is closed', async () => {
    const doc = await openPdf(bytes('two-column-text'))
    const s = spies()
    doc.close()
    doc.close()
    expect(s.document).toHaveBeenCalledTimes(1)
  })

  it('frees a document it refused to open for want of a password', async () => {
    const destroy = vi.spyOn(mupdf.PDFDocument.prototype, 'destroy')
    await expect(openPdf(bytes('password-protected'))).rejects.toThrow(/password/)
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
