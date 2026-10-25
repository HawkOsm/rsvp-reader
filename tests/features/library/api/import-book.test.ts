import { DEFAULT_PAGE, makePageSpec } from '@/core/page-spec'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeToken } from '@/core/types'
import type { ParseResult } from '@/parse/types'
import { loadCover } from '@/storage/covers'
import { loadFile } from '@/storage/files'
import { exportBackup, importBackup } from '@/storage/backup'
import { getTokens } from '@/storage/library'
import { getDb } from '@/storage/schema'
import { importLocalFile } from '@/features/library/api/import-book'

// The parsers and OCR are covered where they live; this is about what the
// import does with what they return.
const parseFileInWorker = vi.fn<(file: File, options: unknown) => Promise<ParseResult>>()
const ocrPdfFile = vi.fn<(file: File, options: unknown) => Promise<ParseResult>>()
vi.mock('@/parse/client', () => ({
  parseFileInWorker: (file: File, options: unknown) => parseFileInWorker(file, options),
}))
vi.mock('@/ocr', () => ({
  ocrPdfFile: (file: File, options: unknown) => ocrPdfFile(file, options),
}))

const text: ParseResult = {
  title: 'A Story',
  tokens: [makeToken('Once'), makeToken('upon.', { paraEnd: true })],
  formatId: 'text',
  layout: { kind: 'reflow' },
  page: DEFAULT_PAGE,
}
const pdf: ParseResult = {
  title: 'A Report',
  tokens: [makeToken('Findings', { page: 0, bbox: [0, 0, 1, 1] })],
  formatId: 'pdf',
  layout: { kind: 'paged', pages: 4 },
  page: makePageSpec(612, 792),
}
const scan: ParseResult = { ...pdf, title: 'A Scan', ocr: true }

let counter = 0
/** A distinct file each time, so one test's book is not another's duplicate. */
const fileOf = (name: string) => new File([`bytes ${counter++}`], name, { lastModified: counter })

beforeEach(async () => {
  parseFileInWorker.mockReset()
  ocrPdfFile.mockReset()
  const db = getDb()
  await Promise.all([
    db.books.clear(),
    db.tokens.clear(),
    db.files.clear(),
    db.progress.clear(),
    db.covers.clear(),
  ])
})

describe('importLocalFile', () => {
  it('stores the book with its format, layout and tokens', async () => {
    parseFileInWorker.mockResolvedValue(text)
    const book = await importLocalFile(fileOf('story.txt'))
    expect(book).toMatchObject({
      title: 'A Story',
      formatId: 'text',
      layout: { kind: 'reflow' },
      totalWords: 2,
    })
    expect(await getTokens(getDb(), book.id as number)).toEqual(text.tokens)
    expect(book.ocr).toBeUndefined()
  })

  it('keeps a PDF’s original file so its pages can be drawn offline', async () => {
    parseFileInWorker.mockResolvedValue(pdf)
    const file = fileOf('report.pdf')
    const book = await importLocalFile(file)
    expect(book.layout).toEqual({ kind: 'paged', pages: 4 })
    expect((await loadFile(getDb(), book.id as number))?.fileName).toBe('report.pdf')
  })

  it('keeps no file for text, which has no pages to draw', async () => {
    parseFileInWorker.mockResolvedValue(text)
    const book = await importLocalFile(fileOf('story.txt'))
    expect(await loadFile(getDb(), book.id as number)).toBeUndefined()
  })

  it('keeps the cover the book came with', async () => {
    const cover = new Blob(['jpg'], { type: 'image/jpeg' })
    parseFileInWorker.mockResolvedValue({ ...text, formatId: 'epub', cover })
    const book = await importLocalFile(fileOf('novel.epub'))
    expect(await loadCover(getDb(), book.id as number)).toBeDefined()
  })

  it('keeps an EPUB’s chapters, and gives a book without any an empty list', async () => {
    const chapters = [
      { title: 'Chapter 1', startTokenIndex: 0 },
      { title: 'Chapter 2', startTokenIndex: 1 },
    ]
    parseFileInWorker.mockResolvedValueOnce({ ...text, formatId: 'epub', chapters })
    const epub = await importLocalFile(fileOf('novel.epub'))
    expect((await getDb().books.get(epub.id as number))?.chapters).toEqual(chapters)

    parseFileInWorker.mockResolvedValueOnce(text)
    const plain = await importLocalFile(fileOf('story.txt'))
    expect(plain.chapters).toEqual([])
  })

  it('passes progress and cancellation through to the parser', async () => {
    parseFileInWorker.mockResolvedValue(text)
    const onProgress = vi.fn()
    const signal = new AbortController().signal
    await importLocalFile(fileOf('story.txt'), { onProgress, signal })
    expect(parseFileInWorker.mock.calls[0]?.[1]).toMatchObject({ onProgress, signal })
  })
})

describe('importing a scan with OCR', () => {
  it('reads it by OCR in the chosen language instead of the normal parser', async () => {
    ocrPdfFile.mockResolvedValue(scan)
    await importLocalFile(fileOf('scan.pdf'), { ocr: { language: 'tur' } })
    expect(parseFileInWorker).not.toHaveBeenCalled()
    expect(ocrPdfFile.mock.calls[0]?.[1]).toMatchObject({ language: 'tur' })
  })

  it('flags the book as recognised, and still keeps its file', async () => {
    ocrPdfFile.mockResolvedValue(scan)
    const book = await importLocalFile(fileOf('scan.pdf'), { ocr: { language: 'eng' } })
    expect(book.ocr).toBe(true)
    expect(book.layout).toEqual({ kind: 'paged', pages: 4 })
    expect(await loadFile(getDb(), book.id as number)).toBeDefined()
  })

  it('does not flag an ordinary PDF', async () => {
    parseFileInWorker.mockResolvedValue(pdf)
    expect((await importLocalFile(fileOf('report.pdf'))).ocr).toBeUndefined()
  })
})

describe('importing something already in the library', () => {
  it('gives back the existing book without reading the file again', async () => {
    parseFileInWorker.mockResolvedValue(text)
    const file = fileOf('story.txt')
    const first = await importLocalFile(file)
    const second = await importLocalFile(file)
    expect(second.id).toBe(first.id)
    expect(parseFileInWorker).toHaveBeenCalledTimes(1)
    expect(await getDb().books.count()).toBe(1)
  })

  it('does not run OCR again for a scan that is already there', async () => {
    ocrPdfFile.mockResolvedValue(scan)
    const file = fileOf('scan.pdf')
    await importLocalFile(file, { ocr: { language: 'eng' } })
    await importLocalFile(file, { ocr: { language: 'tur' } })
    expect(ocrPdfFile).toHaveBeenCalledTimes(1)
  })
})

describe('importing a book whose row is there but is not whole', () => {
  it('reads again a book restored from a backup, which has its row but no tokens', async () => {
    parseFileInWorker.mockResolvedValue(text)
    const file = fileOf('story.txt')
    const first = await importLocalFile(file)
    const backup = await exportBackup(getDb()) // backups leave the tokens out
    await Promise.all([getDb().books.clear(), getDb().tokens.clear()])
    await importBackup(getDb(), backup)
    expect(await getTokens(getDb(), first.id as number)).toBeUndefined()

    const again = await importLocalFile(file)
    expect(again.id).toBe(first.id)
    expect(parseFileInWorker).toHaveBeenCalledTimes(2)
    expect(await getTokens(getDb(), first.id as number)).toEqual(text.tokens)
  })

  it('stores the file of a PDF whose import stopped before saving it', async () => {
    parseFileInWorker.mockResolvedValue(pdf)
    const file = fileOf('report.pdf')
    const first = await importLocalFile(file)
    await getDb().files.delete(first.id as number) // what a failed save leaves
    await importLocalFile(file)
    expect(parseFileInWorker).toHaveBeenCalledTimes(2)
    expect(await loadFile(getDb(), first.id as number)).toBeDefined()
  })

  it('gives a restored legacy book the layout the new reading has, so its boxes are read right', async () => {
    const file = fileOf('old.pdf')
    parseFileInWorker.mockResolvedValue({
      ...pdf,
      layout: { kind: 'paged', pages: 4, boxSpace: 'displayed' },
    })
    const first = await importLocalFile(file)
    // as a pdf.js-era backup restores it: no marker, no tokens
    await getDb().books.update(first.id as number, { layout: { kind: 'paged', pages: 4 } })
    await getDb().tokens.delete(first.id as number)

    const again = await importLocalFile(file)
    expect(again.layout).toEqual({ kind: 'paged', pages: 4, boxSpace: 'displayed' })
  })

  it('clears the OCR flag if the book now reads as plain text', async () => {
    const file = fileOf('scan.pdf')
    ocrPdfFile.mockResolvedValue(scan)
    const first = await importLocalFile(file, { ocr: { language: 'eng' } })
    await getDb().tokens.delete(first.id as number)
    parseFileInWorker.mockResolvedValue(pdf)
    const again = await importLocalFile(file)
    expect(again.ocr).toBeUndefined()
  })
})
