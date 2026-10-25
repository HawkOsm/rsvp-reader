import { describe, expect, it } from 'vitest'
import { bookmarkExcerpt, startIndexFor } from '@/features/reader/bookmark'

const tokens = 'It is a truth universally acknowledged that a single man'
  .split(' ')
  .map((text) => ({ text }))

describe('bookmarkExcerpt', () => {
  it('takes a few words from the marked one', () => {
    expect(bookmarkExcerpt(tokens, 3, 3)).toBe('truth universally acknowledged')
  })

  it('stops at the end of the book', () => {
    expect(bookmarkExcerpt(tokens, 8)).toBe('single man')
  })
})

describe('startIndexFor', () => {
  it('opens at the word the link asks for', () => {
    expect(startIndexFor('4', 1, 10)).toBe(4)
    expect(startIndexFor('0', 7, 10)).toBe(0)
  })

  it('falls back to the saved word for a missing, odd or out-of-range one', () => {
    for (const at of [null, '', 'x', '-1', '2.5', '10']) expect(startIndexFor(at, 6, 10)).toBe(6)
    expect(startIndexFor(null, undefined, 10)).toBe(0)
  })
})
