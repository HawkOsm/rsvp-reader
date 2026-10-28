import type { NoteRecord } from '@/features/reader/api/notes'

// A book's notes as Markdown (docs/architecture/sync.md, section 9): for each
// note, where it is (the page in a PDF, otherwise how far in), the passage it
// is on as a quote, then the note. A note with an unsettled conflict lists
// every version, so nothing is left out of the export.

export interface NotesBook {
  title: string
  author?: string
  totalWords: number
}

/** "Page 3" for a paged book, "Word 1,240 (12%)" otherwise. */
export function notePlace(note: NoteRecord, totalWords: number): string {
  const { page, wordIndex } = note.anchor
  if (page !== undefined && page >= 0) return `Page ${page + 1}`
  const percent = totalWords > 0 ? Math.round((wordIndex / totalWords) * 100) : 0
  return `Word ${(wordIndex + 1).toLocaleString('en')} (${percent}%)`
}

const quote = (text: string) =>
  text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')

export function notesMarkdown(book: NotesBook, notes: readonly NoteRecord[]): string {
  const lines = [`# Notes on ${book.title}`]
  if (book.author) lines.push('', `*${book.author}*`)
  for (const note of notes) {
    lines.push('', `## ${notePlace(note, book.totalWords)}`, '', quote(`${note.anchor.quote}…`))
    lines.push('', note.shown.body)
    for (const other of note.conflicts) {
      const when = new Date(other.at).toISOString().slice(0, 10)
      lines.push('', `*Another version (${when}):*`, '', other.body)
    }
  }
  return `${lines.join('\n')}\n`
}

/** A file name for the export: the title, made safe for any file system. */
export function notesFileName(title: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${safe || 'Book'} - notes.md`
}
