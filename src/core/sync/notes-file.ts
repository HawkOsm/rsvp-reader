// Readable Markdown files for each book's notes on Drive: one file per book
// under Notes/, written for a person to read and edit, and parsed back so
// edits and newly added sections come into the app without losing note ids or
// breaking on Markdown syntax inside a note body.

export interface NotesFileNote {
  noteId: string
  anchor: {
    wordIndex: number
    quote: string
    page?: number
  }
  body: string
  conflicts: {
    body: string
    at: number
  }[]
}

export interface ParsedSection {
  noteId: string | null
  locked: boolean
  place: { page: number } | { word: number }
  body: string
}

export interface ParsedNotesFile {
  book: string | null
  sections: ParsedSection[]
}

const EDIT_GUIDE =
  '<!-- You can edit the text of a note here and the app will take the change. Keep the "note:" lines as they are. To add a note, add a heading like "## Page 12" or "## Word 340" with your text under it. To delete a note, delete it in the app. -->'

const BOOK_LINE = /^<!-- rsvp-reader:book:(\S+) -->$/
const SECTION_HEADING = /^## (Page (\d[\d,]*)|Word (\d[\d,]*))\b.*$/
const NOTE_LINE = /^<!-- note:(\S+)( conflict)? -->$/
const COMMENT_LINE = /^\s*<!--.*-->\s*$/
const NEEDS_ESCAPE = /^(\\*)(## |<!-- )/
const HAS_ESCAPE = /^\\+(## |<!-- )/

function formatPlace(anchor: NotesFileNote['anchor'], totalWords: number): string {
  if (typeof anchor.page === 'number' && anchor.page >= 0) {
    return `Page ${anchor.page + 1}`
  }
  const percent = totalWords > 0 ? Math.round((anchor.wordIndex / totalWords) * 100) : 0
  return `Word ${(anchor.wordIndex + 1).toLocaleString('en-US')} (${percent}%)`
}

function formatQuote(quote: string): string {
  return `${quote.replace(/\r\n/g, '\n')}…`
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
}

// Prefix lines starting with "## " or "<!-- " (and any backslashes already in
// front of them) with one backslash so body text can never be mistaken for a
// section heading or note marker on the next read.
function escapeBody(body: string): string {
  return body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (NEEDS_ESCAPE.test(line) ? `\\${line}` : line))
    .join('\n')
}

function unescapeLine(line: string): string {
  return HAS_ESCAPE.test(line) ? line.slice(1) : line
}

function trimBlankLines(lines: readonly string[]): string[] {
  let start = 0
  while (start < lines.length && lines[start]!.trim() === '') start++
  let end = lines.length
  while (end > start && lines[end - 1]!.trim() === '') end--
  return lines.slice(start, end)
}

function parsePlace(match: RegExpExecArray): ParsedSection['place'] {
  if (match[2] !== undefined) {
    const page = Number.parseInt(match[2].replace(/,/g, ''), 10)
    return { page: Math.max(0, page - 1) }
  }
  const word = Number.parseInt(match[3]!.replace(/,/g, ''), 10)
  return { word: Math.max(0, word - 1) }
}

/** Render one book's notes as a readable Markdown file. */
export function renderNotesFile(
  book: { title: string; author?: string; syncId: string; totalWords: number },
  notes: NotesFileNote[],
): string {
  const lines = [`# Notes on ${book.title}`]
  if (book.author) lines.push('', `*${book.author}*`)
  lines.push('', `<!-- rsvp-reader:book:${book.syncId} -->`, EDIT_GUIDE)

  for (const note of notes) {
    const marker =
      note.conflicts.length > 0
        ? `<!-- note:${note.noteId} conflict -->`
        : `<!-- note:${note.noteId} -->`
    lines.push(
      '',
      `## ${formatPlace(note.anchor, book.totalWords)}`,
      marker,
      '',
      formatQuote(note.anchor.quote),
      '',
      escapeBody(note.body),
    )
    for (const conflict of note.conflicts) {
      const date = new Date(conflict.at).toISOString().slice(0, 10)
      lines.push('', `*Another version (${date}):*`, '', escapeBody(conflict.body))
    }
  }

  return `${lines.join('\n')}\n`
}

/** Parse a Markdown notes file back into its book id and sections. Never throws. */
export function parseNotesFile(text: string): ParsedNotesFile {
  if (typeof text !== 'string') return { book: null, sections: [] }
  const lines = text.replace(/\r\n/g, '\n').split('\n')

  let book: string | null = null
  for (const line of lines) {
    const match = BOOK_LINE.exec(line)
    if (match) {
      book = match[1]!
      break
    }
  }

  const headings: { index: number; place: ParsedSection['place'] }[] = []
  for (let i = 0; i < lines.length; i++) {
    const match = SECTION_HEADING.exec(lines[i]!)
    if (match) headings.push({ index: i, place: parsePlace(match) })
  }

  const sections: ParsedSection[] = []
  for (let h = 0; h < headings.length; h++) {
    const start = headings[h]!.index + 1
    const end = h + 1 < headings.length ? headings[h + 1]!.index : lines.length
    const slice = lines.slice(start, end)

    let firstNonBlank = 0
    while (firstNonBlank < slice.length && slice[firstNonBlank]!.trim() === '') firstNonBlank++
    const noteMatch = firstNonBlank < slice.length ? NOTE_LINE.exec(slice[firstNonBlank]!) : null

    if (noteMatch) {
      const noteId = noteMatch[1]!
      const locked = noteMatch[2] !== undefined
      let cursor = firstNonBlank + 1
      while (cursor < slice.length && slice[cursor]!.trim() === '') cursor++
      while (cursor < slice.length && slice[cursor]!.startsWith('>')) cursor++
      const bodyLines = trimBlankLines(slice.slice(cursor)).map(unescapeLine)
      sections.push({
        noteId,
        locked,
        place: headings[h]!.place,
        body: bodyLines.join('\n'),
      })
    } else {
      // Remove unescaped HTML comments before trimming blank lines so comments
      // at the top or bottom of a person-added section leave no extra spacing.
      const withoutComments = slice.filter((line) => !COMMENT_LINE.test(line))
      const bodyLines = trimBlankLines(withoutComments).map(unescapeLine)
      sections.push({
        noteId: null,
        locked: false,
        place: headings[h]!.place,
        body: bodyLines.join('\n'),
      })
    }
  }

  return { book, sections }
}
