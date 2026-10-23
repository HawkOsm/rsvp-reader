import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { ImportError, inlineParser, type BookParser } from '../src/importing'
import { createServices, type Services } from '../src/services'
import { getDb } from '../src/storage/schema'

let services: Services

beforeEach(() => {
  services = createServices({
    db: getDb(`test-${Math.random().toString(36).slice(2)}`),
    parser: inlineParser,
  })
})

function textFile(text: string, name = 'book.txt', lastModified = 1): File {
  return new File([text], name, { type: 'text/plain', lastModified })
}

describe('importing', () => {
  it('adds a book that the library lists and the reader opens', async () => {
    const imported = await services.importing.importFile(textFile('One two three four.'))

    const [summary] = await services.library.list()
    expect(summary).toMatchObject({ id: imported.id, totalWords: 4, wordIndex: 0, percent: 0 })

    const opened = await services.reading.open(imported.id)
    expect(opened?.tokens.map((t) => t.text)).toEqual(['One', 'two', 'three', 'four.'])
  })

  it('returns the existing book when the same file is added twice', async () => {
    const first = await services.importing.importFile(textFile('Same words.'))
    const second = await services.importing.importFile(textFile('Same words.'))
    expect(second.id).toBe(first.id)
    expect(await services.library.list()).toHaveLength(1)
  })

  it("keeps a PDF's bytes for the page view, and not a text file's", async () => {
    const pdf = new File([readFileSync('tests/fixtures/two-column-text.pdf')], 'two.pdf', {
      type: 'application/pdf',
    })
    const pdfBook = await services.importing.importFile(pdf)
    const txtBook = await services.importing.importFile(textFile('Plain text.'))

    expect(await services.reading.originalFile(pdfBook.id)).not.toBeNull()
    expect(await services.reading.originalFile(txtBook.id)).toBeNull()
  })

  it("passes a parser's own message through as an ImportError", async () => {
    const locked = new File([readFileSync('tests/fixtures/password-protected.pdf')], 'locked.pdf')
    const error = await services.importing.importFile(locked).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ImportError)
    expect((error as Error).message).toMatch(/password protected/i)
  })

  it('hides an unexpected failure behind a generic message', async () => {
    const broken: BookParser = { parse: () => Promise.reject(new Error('worker crashed')) }
    const withBroken = createServices({ db: getDb(`test-${Math.random()}`), parser: broken })
    await expect(withBroken.importing.importFile(textFile('x'))).rejects.toThrow(
      new ImportError('Could not add that file.'),
    )
  })
})

describe('reading', () => {
  it('starts a new book at the default WPM, then resumes where it was left', async () => {
    const { id } = await services.importing.importFile(textFile('a b c d e f g h i j'))

    const fresh = await services.reading.open(id, { defaultWpm: 450 })
    expect(fresh?.position).toEqual({ wordIndex: 0, wpm: 450, mode: 'rsvp' })

    await services.reading.savePosition(id, { wordIndex: 5, wpm: 320, mode: 'book' })
    const resumed = await services.reading.open(id, { defaultWpm: 450 })
    expect(resumed?.position).toEqual({ wordIndex: 5, wpm: 320, mode: 'book' })

    const [summary] = await services.library.list()
    expect(summary?.percent).toBe(50)
    expect(summary?.lastOpenedAt).not.toBeNull()
  })

  it('returns null for a book that is gone', async () => {
    expect(await services.reading.open(999)).toBeNull()
  })
})

describe('library', () => {
  it('resets a position to the start, keeping the WPM', async () => {
    const { id } = await services.importing.importFile(textFile('a b c d'))
    await services.reading.savePosition(id, { wordIndex: 3, wpm: 500, mode: 'rsvp' })

    await services.library.resetPosition(id)

    expect((await services.reading.open(id))?.position).toEqual({ wordIndex: 0, wpm: 500, mode: 'rsvp' })
  })

  it('removes a book and everything stored for it', async () => {
    const { id } = await services.importing.importFile(textFile('a b c d'))
    await services.library.remove(id)
    expect(await services.library.list()).toEqual([])
    expect(await services.reading.open(id)).toBeNull()
  })
})

describe('settings', () => {
  it('fills unsaved keys from the defaults', async () => {
    await services.settings.save('fontSize', 72)
    expect(await services.settings.load({ fontSize: 56, theme: 'system' })).toEqual({
      fontSize: 72,
      theme: 'system',
    })
  })
})
