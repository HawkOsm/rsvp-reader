import { describe, expect, it } from 'vitest'
import {
  nextShelfColor,
  sectionCounts,
  sectionOf,
  shelve,
  statusLabel,
} from '@/features/library/shelf'

const books = [
  { title: 'Walden', p: 30 },
  { title: 'Émile', p: 0 },
  { title: 'Dracula', p: 100 },
  { title: 'Meditations', p: 60 },
]
const percent = (b: { p: number }) => b.p
const titles = (list: { title: string }[]) => list.map((b) => b.title)

describe('sectionOf', () => {
  it('splits by how much is read', () => {
    expect(sectionOf(0)).toBe('new')
    expect(sectionOf(0.5)).toBe('reading')
    expect(sectionOf(100)).toBe('finished')
  })
})

describe('sectionCounts', () => {
  it('counts every section', () => {
    expect(sectionCounts(books.map(percent))).toEqual({ all: 4, reading: 2, new: 1, finished: 1 })
  })
})

describe('shelve', () => {
  const all = { section: 'all', query: '', sort: 'recent' } as const

  it('keeps the given order for "recent"', () => {
    expect(titles(shelve(books, percent, all))).toEqual([
      'Walden',
      'Émile',
      'Dracula',
      'Meditations',
    ])
  })

  it('shows one section', () => {
    expect(titles(shelve(books, percent, { ...all, section: 'reading' }))).toEqual([
      'Walden',
      'Meditations',
    ])
  })

  it('searches titles ignoring case and accents', () => {
    expect(titles(shelve(books, percent, { ...all, query: ' emi ' }))).toEqual(['Émile'])
    expect(titles(shelve(books, percent, { ...all, query: 'DRAC' }))).toEqual(['Dracula'])
  })

  it('sorts by title or by progress', () => {
    expect(titles(shelve(books, percent, { ...all, sort: 'title' }))).toEqual([
      'Dracula',
      'Émile',
      'Meditations',
      'Walden',
    ])
    expect(titles(shelve(books, percent, { ...all, sort: 'progress' }))).toEqual([
      'Dracula',
      'Meditations',
      'Walden',
      'Émile',
    ])
  })

  it('does not reorder the list it was given', () => {
    const copy = [...books]
    shelve(books, percent, { ...all, sort: 'title' })
    expect(books).toEqual(copy)
  })
})

describe('shelve, with a shelf picked', () => {
  it('shows only the books on it, still by section and search', () => {
    const list = [
      { id: 1, title: 'Walden', p: 30 },
      { id: 2, title: 'Dracula', p: 100 },
      { id: 3, title: 'Meditations', p: 60 },
    ]
    const on = { section: 'all', query: '', sort: 'recent', shelfBookIds: [1, 2] } as const
    expect(titles(shelve(list, percent, on))).toEqual(['Walden', 'Dracula'])
    expect(titles(shelve(list, percent, { ...on, section: 'reading' }))).toEqual(['Walden'])
    expect(titles(shelve(list, percent, { ...on, shelfBookIds: [] }))).toEqual([])
  })
})

describe('nextShelfColor', () => {
  it('takes the first colour no shelf has', () => {
    expect(nextShelfColor([])).toBe('accent')
    expect(nextShelfColor(['accent', 'shelf-green'])).toBe('shelf-blue')
  })

  it('goes round again once every colour is taken', () => {
    const all = ['accent', 'shelf-blue', 'shelf-green', 'shelf-amber', 'shelf-violet'] as const
    expect(nextShelfColor(all)).toBe('accent')
    expect(nextShelfColor([...all, 'accent'])).toBe('shelf-blue')
  })
})

describe('shelve, through a filter chip', () => {
  const list = [
    { title: 'Walden', p: 30, formatId: 'epub' },
    { title: 'Notes', p: 0, formatId: 'pdf' },
    { title: 'Dracula', p: 100, formatId: 'epub' },
  ]
  const on = { section: 'all', query: '', sort: 'recent' } as const

  it('narrows by how much is read', () => {
    expect(titles(shelve(list, percent, { ...on, filter: 'new' }))).toEqual(['Notes'])
    expect(titles(shelve(list, percent, { ...on, filter: 'finished' }))).toEqual(['Dracula'])
  })

  it('narrows by format, inside the sidebar’s section', () => {
    expect(titles(shelve(list, percent, { ...on, filter: 'epub' }))).toEqual(['Walden', 'Dracula'])
    expect(titles(shelve(list, percent, { ...on, section: 'reading', filter: 'epub' }))).toEqual([
      'Walden',
    ])
    expect(titles(shelve(list, percent, { ...on, filter: 'pdf' }))).toEqual(['Notes'])
  })
})

describe('statusLabel', () => {
  it('says New, Finished, or the percent read, rounded down', () => {
    expect(statusLabel(0)).toBe('New')
    expect(statusLabel(47.9)).toBe('47%')
    expect(statusLabel(99.7)).toBe('99%')
    expect(statusLabel(100)).toBe('Finished')
  })
})

describe('shelve, searching', () => {
  it('matches the author too', () => {
    const list = [
      { title: 'Emma', author: 'Jane Austen', p: 0 },
      { title: 'Walden', p: 0 },
    ]
    const on = { section: 'all', sort: 'recent' } as const
    expect(titles(shelve(list, percent, { ...on, query: 'austen' }))).toEqual(['Emma'])
    expect(titles(shelve(list, percent, { ...on, query: 'walden' }))).toEqual(['Walden'])
  })
})
