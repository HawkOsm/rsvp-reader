import { describe, expect, it } from 'vitest'
import { dropRepeatedHeadersFooters } from '../../../src/parse/pdf/repeats'
import type { RawLine } from '../../../src/parse/pdf/types'

function line(text: string): RawLine {
  return { page: 0, x0: 72, y: 700, words: [{ text, page: 0, bbox: [72, 700, 100, 712] }] }
}

function page(header: string, body: string[], footer: string): RawLine[] {
  return [line(header), ...body.map(line), line(footer)]
}

describe('dropRepeatedHeadersFooters', () => {
  it('drops a header/footer repeated on every page', () => {
    const pages = [
      page('My Book', ['First', 'page.'], '1'),
      page('My Book', ['Second', 'page.'], '2'),
      page('My Book', ['Third', 'page.'], '3'),
      page('My Book', ['Fourth', 'page.'], '4'),
    ]

    const cleaned = dropRepeatedHeadersFooters(pages)

    for (const cleanedPage of cleaned) {
      expect(cleanedPage.map((l) => l.words[0]?.text)).not.toContain('My')
    }
    // Page numbers were normalised (digits collapsed) before comparing, so
    // they're recognised as "the same" repeated footer and dropped too.
    expect(cleaned[0]?.map((l) => l.words[0]?.text)).toEqual(['First', 'page.'])
  })

  it('leaves a page-unique first/last line alone', () => {
    const pages = [
      page('Chapter One', ['Body', 'text.'], '1'),
      page('Chapter Two', ['More', 'text.'], '2'),
      page('Chapter Three', ['Even', 'more.'], '3'),
    ]
    const cleaned = dropRepeatedHeadersFooters(pages)
    expect(cleaned[0]?.[0]?.words[0]?.text).toBe('Chapter One')
  })

  it('does nothing with fewer than 3 pages', () => {
    const pages = [page('My Book', ['A'], '1'), page('My Book', ['B'], '2')]
    const cleaned = dropRepeatedHeadersFooters(pages)
    expect(cleaned).toEqual(pages)
  })

  it('does not drop a real one-line page as if it were a header', () => {
    // A single-line page: the same line is both "first" and "last" — must
    // not be double-counted or dropped as a footer too when it's the header.
    const pages = [
      [line('Lonely line one.')],
      [line('Lonely line two.')],
      [line('Lonely line three.')],
    ]
    const cleaned = dropRepeatedHeadersFooters(pages)
    expect(cleaned).toEqual(pages)
  })
})
