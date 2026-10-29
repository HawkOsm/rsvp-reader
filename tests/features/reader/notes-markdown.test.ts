import { describe, expect, it } from 'vitest'
import type { NoteRecord } from '@/features/reader/api/notes'
import { notePlace, notesFileName, notesMarkdown } from '@/features/reader/notes-markdown'

const note = (over: Partial<NoteRecord> = {}): NoteRecord => ({
  noteId: 'n',
  bookId: 1,
  anchor: { wordIndex: 1239, quote: 'It was a dark and stormy night' },
  shown: { edit: 'e', body: 'Famously bad.', at: Date.UTC(2026, 9, 28), device: 'd' },
  conflicts: [],
  lostDeletes: [],
  createdAt: 1,
  ...over,
})

describe('notes as Markdown', () => {
  it('says where a note is: the page in a PDF, how far in otherwise', () => {
    expect(notePlace(note(), 10_000)).toBe('Word 1,240 (12%)')
    expect(notePlace(note({ anchor: { wordIndex: 5, quote: 'q', page: 2 } }), 10_000)).toBe(
      'Page 3',
    )
  })

  it('quotes the passage and gives the note, and every version of a conflict', () => {
    const markdown = notesMarkdown(
      { title: 'Paul Clifford', author: 'Bulwer-Lytton', totalWords: 10_000 },
      [
        note(),
        note({
          anchor: { wordIndex: 5, quote: 'the rain fell\nin torrents', page: 0 },
          shown: { edit: 'a', body: 'Weather.', at: Date.UTC(2026, 9, 28), device: 'A' },
          conflicts: [{ edit: 'b', body: 'Rain.', at: Date.UTC(2026, 9, 27), device: 'B' }],
        }),
      ],
    )
    expect(markdown).toBe(
      [
        '# Notes on Paul Clifford',
        '',
        '*Bulwer-Lytton*',
        '',
        '## Word 1,240 (12%)',
        '',
        '> It was a dark and stormy night…',
        '',
        'Famously bad.',
        '',
        '## Page 1',
        '',
        '> the rain fell',
        '> in torrents…',
        '',
        'Weather.',
        '',
        '*Another version (2026-10-27):*',
        '',
        'Rain.',
        '',
      ].join('\n'),
    )
  })

  it('names the file after the book, safely', () => {
    expect(notesFileName('Paul Clifford')).toBe('Paul Clifford - notes.md')
    expect(notesFileName('A/B: "C"?')).toBe('A B C - notes.md')
    expect(notesFileName('///')).toBe('Book - notes.md')
  })
})
