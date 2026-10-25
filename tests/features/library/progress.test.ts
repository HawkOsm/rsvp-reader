import { describe, expect, it } from 'vitest'
import { bookToContinue, percentRead } from '@/features/library/progress'

describe('percentRead', () => {
  it('is 0 with no progress or no words', () => {
    expect(percentRead(100, undefined)).toBe(0)
    expect(percentRead(0, 10)).toBe(0)
  })

  it('is the share of words read, capped at 100', () => {
    expect(percentRead(200, 50)).toBe(25)
    expect(percentRead(100, 150)).toBe(100)
  })
})

describe('bookToContinue', () => {
  const books = [
    { id: 1, totalWords: 100 }, // not started
    { id: 2, totalWords: 100 }, // finished
    { id: 3, totalWords: 100 }, // in progress
    { id: 4, totalWords: 100 }, // also in progress, opened earlier
  ]
  const progress: Record<number, number> = { 2: 100, 3: 40, 4: 10 }

  it('picks the first book that is started but not finished', () => {
    expect(bookToContinue(books, (id) => progress[id])?.id).toBe(3)
  })

  it('is undefined when nothing is in progress', () => {
    expect(bookToContinue(books.slice(0, 2), (id) => progress[id])).toBeUndefined()
  })
})
