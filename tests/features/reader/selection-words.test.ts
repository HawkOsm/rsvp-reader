import { afterEach, describe, expect, it } from 'vitest'
import { MAX_NOTE_WORDS, quoteOf, registerPage, wordsOf } from '@/features/reader/selection-words'

// jsdom lays nothing out, and its ranges have no rectangles at all.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList

afterEach(() => document.body.replaceChildren())

/** Reflowed text as the reader draws it: a span a word, marked with its index. */
function reflow(words: string[]) {
  const p = document.createElement('p')
  words.forEach((word, index) => {
    const span = document.createElement('span')
    span.setAttribute('data-word', String(index))
    span.textContent = `${word} `
    p.append(span)
  })
  document.body.append(p)
  return p
}

function select(from: Node, to: Node) {
  const range = document.createRange()
  range.setStart(from, 0)
  range.setEnd(to, to.textContent?.length ?? 0)
  return range
}

describe('the words a selection covers', () => {
  it('reads them off reflowed text, whichever way it was dragged', () => {
    const p = reflow(['It', 'was', 'a', 'dark', 'night'])
    const text = (i: number) => p.children[i]!.firstChild!
    expect(wordsOf(select(text(1), text(3)))).toEqual({ start: 1, end: 3 })
    expect(wordsOf(select(text(2), text(2)))).toEqual({ start: 2, end: 2 })
  })

  it('is nothing for an empty selection, or one that is not on the book’s words', () => {
    const p = reflow(['It', 'was'])
    const range = document.createRange()
    range.setStart(p.children[0]!.firstChild!, 1)
    range.collapse(true)
    expect(wordsOf(range)).toBeNull()

    const aside = document.createElement('div')
    aside.textContent = 'Settings and such'
    document.body.append(aside)
    expect(wordsOf(select(aside.firstChild!, aside.firstChild!))).toBeNull()
  })

  it('asks a PDF page which word is at each end, until the page is gone', () => {
    const page = document.createElement('div')
    const line = document.createElement('span')
    line.textContent = 'a line of the page'
    page.append(line)
    document.body.append(page)
    const asked: number[] = []
    const undo = registerPage(page, (x) => {
      asked.push(x)
      return asked.length === 1 ? 40 : 44
    })
    expect(wordsOf(select(line.firstChild!, line.firstChild!))).toEqual({ start: 40, end: 44 })
    expect(asked).toHaveLength(2)
    undo()
    expect(wordsOf(select(line.firstChild!, line.firstChild!))).toBeNull()
  })

  it('cuts a very long selection short', () => {
    const p = reflow(Array.from({ length: 200 }, (_, i) => `w${i}`))
    const range = select(p.children[10]!.firstChild!, p.children[190]!.firstChild!)
    expect(wordsOf(range)).toEqual({ start: 10, end: 10 + MAX_NOTE_WORDS - 1 })
  })

  it('quotes the words of a range, both ends included', () => {
    const tokens = ['It', 'was', 'a', 'dark', 'night'].map((text) => ({ text }))
    expect(quoteOf(tokens, { start: 1, end: 3 })).toBe('was a dark')
  })
})
