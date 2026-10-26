import { describe, expect, it } from 'vitest'
import { chapterAt, chapterTicks, wordsLeftInChapter } from '@/features/reader/chapters'

const chapters = [{ startTokenIndex: 10 }, { startTokenIndex: 40 }, { startTokenIndex: 70 }]

describe('chapterAt', () => {
  it('finds the chapter a word is in, its first word included', () => {
    expect(chapterAt(chapters, 10)).toBe(0)
    expect(chapterAt(chapters, 39)).toBe(0)
    expect(chapterAt(chapters, 40)).toBe(1)
    expect(chapterAt(chapters, 99)).toBe(2)
  })

  it('is -1 before the first chapter, and for a book without chapters', () => {
    expect(chapterAt(chapters, 9)).toBe(-1)
    expect(chapterAt([], 5)).toBe(-1)
  })
})

describe('chapterTicks', () => {
  it('puts each chapter start on the slider’s scale', () => {
    expect(chapterTicks([{ startTokenIndex: 0 }, { startTokenIndex: 50 }], 101)).toEqual([0.5])
  })

  it('draws nothing for a book without chapters, or too short for a bar', () => {
    expect(chapterTicks([], 100)).toEqual([])
    expect(chapterTicks(chapters, 1)).toEqual([])
  })
})

describe('wordsLeftInChapter', () => {
  it('counts to the next chapter, or to the end of the book in the last one', () => {
    expect(wordsLeftInChapter(chapters, 10, 100)).toBe(29)
    expect(wordsLeftInChapter(chapters, 39, 100)).toBe(0)
    expect(wordsLeftInChapter(chapters, 90, 100)).toBe(9)
  })

  it('is null before the first chapter and without chapters', () => {
    expect(wordsLeftInChapter(chapters, 0, 100)).toBeNull()
    expect(wordsLeftInChapter([], 50, 100)).toBeNull()
  })
})
