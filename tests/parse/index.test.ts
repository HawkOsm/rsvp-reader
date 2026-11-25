import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ExtractionError } from '@/parse/errors'
import { parseFile } from '@/parse'

function textFile(content: string, name: string): File {
  return new File([content], name, { type: 'text/plain' })
}

describe('parseFile', () => {
  it('dispatches .txt to the text parser', async () => {
    const result = await parseFile(textFile('Hello world.', 'book.txt'))
    expect(result.tokens.map((t) => t.text)).toEqual(['Hello', 'world.'])
  })

  it('dispatches .md to the text parser with Markdown stripped', async () => {
    const result = await parseFile(textFile('# Heading', 'notes.md'))
    expect(result.tokens.map((t) => t.text)).toEqual(['Heading'])
  })

  it('dispatches .pdf to the PDF parser', async () => {
    const file = new File([readFileSync('tests/fixtures/hyphenated-line-breaks.pdf')], 'book.pdf', {
      type: 'application/pdf',
    })
    const result = await parseFile(file)
    expect(result.layout).toEqual({ kind: 'paged', pages: 1, boxSpace: 'displayed' })
    expect(result.formatId).toBe('pdf')
    expect(result.tokens.length).toBeGreaterThan(0)
  })

  it('dispatches .epub to the EPUB parser', async () => {
    const file = new File(
      [readFileSync('tests/fixtures/austen-pride-and-prejudice.epub')],
      'book.epub',
      { type: 'application/epub+zip' },
    )
    const result = await parseFile(file)
    expect(result.title).toBe('Pride and Prejudice')
    expect(result.formatId).toBe('epub')
    expect(result.layout).toEqual({ kind: 'reflow' })
  })

  it('treats an unknown extension as text rather than refusing outright', async () => {
    const result = await parseFile(textFile('Some words here.', 'notes.xyz'))
    expect(result.tokens.map((t) => t.text)).toEqual(['Some', 'words', 'here.'])
    expect(result.formatId).toBe('text')
  })

  it('is case-insensitive on the extension', async () => {
    const result = await parseFile(textFile('Word.', 'BOOK.TXT'))
    expect(result.tokens.map((t) => t.text)).toEqual(['Word.'])
  })

  it('surfaces an ExtractionError from the underlying parser', async () => {
    await expect(parseFile(textFile('   ', 'empty.txt'))).rejects.toThrow(ExtractionError)
  })

  // The fallback for an unknown extension is "try it as text". That must
  // not turn a picture into a book: this one opened as pages of
  // "ÿØÿà JFIF ICC_PROFILE …" under its file name as a title.
  it('refuses a file with no extension that is not text, saying so', async () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06,
      0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b,
      0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
      0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31,
      0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff,
    ])
    const file = new File([jpeg], 'b13fee8d-cf1e-4581-b8ea-a500a2e097d2')
    await expect(parseFile(file)).rejects.toThrow(ExtractionError)
  })
})
