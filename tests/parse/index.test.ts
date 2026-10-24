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
})
