import { describe, expect, it } from 'vitest'
import { bookmarkRows } from '@/features/library/bookmarks'

describe('bookmarkRows', () => {
  it('gives each mark its book’s title and how far in it is, keeping the order', () => {
    const books = [
      { id: 1, title: 'Walden', totalWords: 200 },
      { id: 2, title: 'Emma', totalWords: 0 },
    ]
    const marks = [
      { id: 10, bookId: 2, wordIndex: 5, excerpt: 'Emma Woodhouse' },
      { id: 11, bookId: 1, wordIndex: 50, excerpt: 'I went to the woods' },
    ]
    expect(bookmarkRows(marks, books)).toEqual([
      { id: 10, bookId: 2, wordIndex: 5, title: 'Emma', excerpt: 'Emma Woodhouse', percent: 0 },
      {
        id: 11,
        bookId: 1,
        wordIndex: 50,
        title: 'Walden',
        excerpt: 'I went to the woods',
        percent: 25,
      },
    ])
  })

  it('leaves out a mark whose book is gone', () => {
    const marks = [{ id: 1, bookId: 9, wordIndex: 0, excerpt: 'x' }]
    expect(bookmarkRows(marks, [])).toEqual([])
  })
})
