import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { ImportError } from '@/features/library/api/import-error'
import { ImportService } from '@/features/library/api/import-service'
import { LibraryService } from '@/features/library/api/library-service'
import { inlineParser, type BookParser } from '@/features/library/api/parser'
import { ReadingService } from '@/features/reader/api/reading-service'
import { DexieRepository } from '@/storage/repository'
import { getDb } from '@/storage/schema'

let repo: DexieRepository
let importer: ImportService
let library: LibraryService

beforeEach(() => {
  repo = new DexieRepository(getDb(`test-${Math.random().toString(36).slice(2)}`))
  importer = new ImportService(repo, inlineParser)
  library = new LibraryService(repo)
})

function textFile(text: string, name = 'book.txt'): File {
  return new File([text], name, { type: 'text/plain', lastModified: 1 })
}

describe('ImportService', () => {
  it('adds a book that the library lists', async () => {
    const imported = await importer.importFile(textFile('One two three four.'))
    const [summary] = await library.list()
    expect(summary).toMatchObject({ id: imported.id, totalWords: 4, wordIndex: 0, percent: 0 })
  })

  it('returns the existing book when the same file is added twice', async () => {
    const first = await importer.importFile(textFile('Same words.'))
    const second = await importer.importFile(textFile('Same words.'))
    expect(second.id).toBe(first.id)
    expect(await library.list()).toHaveLength(1)
  })

  it("keeps a PDF's bytes for the page view, and not a text file's", async () => {
    const pdf = new File([readFileSync('tests/fixtures/two-column-text.pdf')], 'two.pdf', {
      type: 'application/pdf',
    })
    const reading = new ReadingService(repo)
    const pdfBook = await importer.importFile(pdf)
    const txtBook = await importer.importFile(textFile('Plain text.'))

    expect(await reading.originalFile(pdfBook.id)).not.toBeNull()
    expect(await reading.originalFile(txtBook.id)).toBeNull()
  })

  it("passes a parser's own message through as an ImportError", async () => {
    const locked = new File([readFileSync('tests/fixtures/password-protected.pdf')], 'locked.pdf')
    const error = await importer.importFile(locked).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ImportError)
    expect((error as Error).message).toMatch(/password protected/i)
  })

  it('hides an unexpected failure behind a generic message', async () => {
    const broken: BookParser = { parse: () => Promise.reject(new Error('worker crashed')) }
    await expect(new ImportService(repo, broken).importFile(textFile('x'))).rejects.toThrow(
      new ImportError('Could not add that file.'),
    )
  })
})

describe('LibraryService', () => {
  it('reports how far through each book is', async () => {
    const { id } = await importer.importFile(textFile('a b c d e f g h i j'))
    await repo.saveProgress(id, { wordIndex: 5, wpm: 300, mode: 'rsvp' })
    const [summary] = await library.list()
    expect(summary).toMatchObject({ wordIndex: 5, percent: 50 })
  })

  it('resets a position to the start, keeping the WPM', async () => {
    const { id } = await importer.importFile(textFile('a b c d'))
    await repo.saveProgress(id, { wordIndex: 3, wpm: 500, mode: 'rsvp' })

    await library.resetPosition(id)

    expect(await repo.getProgress(id)).toMatchObject({ wordIndex: 0, wpm: 500 })
  })

  it('removes a book and everything stored for it', async () => {
    const { id } = await importer.importFile(textFile('a b c d'))
    await library.remove(id)
    expect(await library.list()).toEqual([])
    expect(await repo.getTokens(id)).toBeUndefined()
  })
})
