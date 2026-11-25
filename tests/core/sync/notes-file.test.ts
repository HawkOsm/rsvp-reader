import { describe, expect, it } from 'vitest'
import { parseNotesFile, renderNotesFile, type NotesFileNote } from '@/core/sync/notes-file'

describe('renderNotesFile', () => {
  it('renders a PDF-page note with an author in the exact format', () => {
    const text = renderNotesFile(
      {
        title: 'Pride and Prejudice',
        author: 'Jane Austen',
        syncId: 'book-sync-1',
        totalWords: 120000,
      },
      [
        {
          noteId: 'n1',
          anchor: { wordIndex: 42, quote: 'It is a truth universally acknowledged', page: 2 },
          body: 'Famous opening line.',
          conflicts: [],
        },
      ],
    )

    expect(text).toBe(
      [
        '# Notes on Pride and Prejudice',
        '',
        '*Jane Austen*',
        '',
        '<!-- rsvp-reader:book:book-sync-1 -->',
        '<!-- You can edit the text of a note here and the app will take the change. Keep the "note:" lines as they are. To add a note, add a heading like "## Page 12" or "## Word 340" with your text under it. To delete a note, delete it in the app. -->',
        '',
        '## Page 3',
        '<!-- note:n1 -->',
        '',
        '> It is a truth universally acknowledged…',
        '',
        'Famous opening line.',
        '',
      ].join('\n'),
    )
  })

  it('renders a reflow note without an author in the exact format', () => {
    const text = renderNotesFile(
      {
        title: 'Dark',
        syncId: 'book-sync-2',
        totalWords: 2000,
      },
      [
        {
          noteId: 'n2',
          anchor: { wordIndex: 1339, quote: 'dark and stormy night' },
          body: 'Opening cliché.',
          conflicts: [],
        },
      ],
    )

    expect(text).toBe(
      [
        '# Notes on Dark',
        '',
        '<!-- rsvp-reader:book:book-sync-2 -->',
        '<!-- You can edit the text of a note here and the app will take the change. Keep the "note:" lines as they are. To add a note, add a heading like "## Page 12" or "## Word 340" with your text under it. To delete a note, delete it in the app. -->',
        '',
        '## Word 1,340 (67%)',
        '<!-- note:n2 -->',
        '',
        '> dark and stormy night…',
        '',
        'Opening cliché.',
        '',
      ].join('\n'),
    )
  })

  it('renders a note with one conflict, marking it locked and showing UTC date', () => {
    const at = Date.UTC(2026, 2, 15, 23, 30, 0) // 2026-03-15 UTC
    const text = renderNotesFile(
      {
        title: 'Dark',
        syncId: 'book-sync-2',
        totalWords: 0,
      },
      [
        {
          noteId: 'n3',
          anchor: { wordIndex: 0, quote: 'It was' },
          body: 'First device text',
          conflicts: [{ body: 'Second device text', at }],
        },
      ],
    )

    expect(text).toBe(
      [
        '# Notes on Dark',
        '',
        '<!-- rsvp-reader:book:book-sync-2 -->',
        '<!-- You can edit the text of a note here and the app will take the change. Keep the "note:" lines as they are. To add a note, add a heading like "## Page 12" or "## Word 340" with your text under it. To delete a note, delete it in the app. -->',
        '',
        '## Word 1 (0%)',
        '<!-- note:n3 conflict -->',
        '',
        '> It was…',
        '',
        'First device text',
        '',
        '*Another version (2026-03-15):*',
        '',
        'Second device text',
        '',
      ].join('\n'),
    )
  })
})

describe('parseNotesFile', () => {
  it('round-trips tricky bodies with headings, comments, backslashes, quotes, spacing, CRLF and Unicode', () => {
    const notes: NotesFileNote[] = [
      {
        noteId: 'n-headings',
        anchor: { wordIndex: 0, quote: 'first', page: 0 },
        body: ['## Page 3', '<!-- note:x -->', '\\## Page 3', '\\<!-- note:y -->'].join('\n'),
        conflicts: [],
      },
      {
        noteId: 'n-quotes',
        anchor: { wordIndex: 10, quote: 'second' },
        body: ['> quoted line', '', '  inner leading and trailing  ', 'normal line'].join('\n'),
        conflicts: [],
      },
      {
        noteId: 'n-unicode',
        anchor: { wordIndex: 20, quote: 'third' },
        body: 'Türkçe harfler: ğüşıöç ĞÜŞİÖÇ 🚀📖',
        conflicts: [],
      },
    ]

    const rendered = renderNotesFile(
      { title: 'Tricky', author: 'A. Author', syncId: 'sync-tricky', totalWords: 100 },
      notes,
    )
    const withCrlf = rendered.replace(/\n/g, '\r\n')
    const parsed = parseNotesFile(withCrlf)

    expect(parsed.book).toBe('sync-tricky')
    expect(parsed.sections).toEqual([
      {
        noteId: 'n-headings',
        locked: false,
        place: { page: 0 },
        body: notes[0]!.body,
      },
      {
        noteId: 'n-quotes',
        locked: false,
        place: { word: 10 },
        body: notes[1]!.body,
      },
      {
        noteId: 'n-unicode',
        locked: false,
        place: { word: 20 },
        body: notes[2]!.body,
      },
    ])
  })

  it('parses person-added sections with page or comma-formatted word numbers', () => {
    const text = [
      '# Notes on Something',
      '',
      '<!-- rsvp-reader:book:sync-1 -->',
      '',
      '## Page 12',
      '',
      '<!-- personal comment -->',
      'Added on page twelve.',
      '',
      '## Other heading inside note',
      '',
      '## Word 1,340',
      '',
      'Added at word 1340.',
      '',
    ].join('\n')

    const parsed = parseNotesFile(text)
    expect(parsed.book).toBe('sync-1')
    expect(parsed.sections).toEqual([
      {
        noteId: null,
        locked: false,
        place: { page: 11 },
        body: 'Added on page twelve.\n\n## Other heading inside note',
      },
      {
        noteId: null,
        locked: false,
        place: { word: 1339 },
        body: 'Added at word 1340.',
      },
    ])
  })

  it('parses junk text safely without throwing', () => {
    expect(parseNotesFile('')).toEqual({ book: null, sections: [] })
    expect(parseNotesFile('Just some random markdown\n\n## Not a page or word\nhello')).toEqual({
      book: null,
      sections: [],
    })
  })
})
