import { beforeEach, describe, expect, it } from 'vitest'
import { ReadingService } from '@/features/reader/api/reading-service'
import { makeToken } from '@/core/types'
import { DexieRepository } from '@/storage/repository'
import { getDb } from '@/storage/schema'

let repo: DexieRepository
let reading: ReadingService

beforeEach(() => {
  repo = new DexieRepository(getDb(`test-${Math.random().toString(36).slice(2)}`))
  reading = new ReadingService(repo)
})

async function addBook(words: string[]): Promise<number> {
  const book = await repo.addBook({ title: 'T', source: 'local', fingerprint: 'f' })
  const tokens = words.map((w) => makeToken(w))
  await repo.saveTokens(book.id as number, tokens, 'f')
  return book.id as number
}

describe('ReadingService', () => {
  it('starts a new book at the default WPM, then resumes where it was left', async () => {
    const id = await addBook(['a', 'b', 'c', 'd'])

    const fresh = await reading.open(id, { defaultWpm: 450 })
    expect(fresh?.tokens.map((t) => t.text)).toEqual(['a', 'b', 'c', 'd'])
    expect(fresh?.position).toEqual({ wordIndex: 0, wpm: 450, mode: 'rsvp' })

    await reading.savePosition(id, { wordIndex: 2, wpm: 320, mode: 'book' })
    const resumed = await reading.open(id, { defaultWpm: 450 })
    expect(resumed?.position).toEqual({ wordIndex: 2, wpm: 320, mode: 'book' })
  })

  it('marks the book opened', async () => {
    const id = await addBook(['a'])
    await reading.open(id)
    expect((await repo.getBook(id))?.lastOpenedAt).not.toBeNull()
  })

  it('returns null for a book that is gone', async () => {
    expect(await reading.open(999)).toBeNull()
  })
})
