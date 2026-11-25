import type { NoteAnchor } from '@/core/sync/notes'
import { parseNotesFile, renderNotesFile, type ParsedSection } from '@/core/sync/notes-file'
import type { Token } from '@/core/types'
import { getTokens } from '@/storage/library'
import { addNote, editNote, notesOf } from '@/storage/notes'
import {
  deleteNotesFile,
  getNotesFile,
  listNotesFiles,
  notesFilesForBook,
  putNotesFile,
} from '@/storage/notes-files'
import type { NotesFileRecord, RsvpDatabase } from '@/storage/schema'
import { sha256 } from '@/storage/sync-id'
import { readableDriveName } from './book-files'
import { NOTES_DIR } from './files'
import type { Transport } from './transport'

// Per-book readable Markdown files under `Notes/` on Drive: write every local
// book's notes out for reading and editing in Drive, and bring back edits or
// newly added sections as note edits so they sync across devices too.

const QUOTE_WORDS = 12

function anchorForPlace(place: ParsedSection['place'], tokens: readonly Token[]): NoteAnchor {
  let wordIndex = 0
  if ('word' in place) {
    wordIndex = Math.max(0, Math.min(place.word, tokens.length - 1))
  } else if (tokens.length > 0) {
    const pageStarts = new Map<number, number>()
    for (let i = 0; i < tokens.length; i++) {
      const page = tokens[i]!.page
      if (page >= 0 && !pageStarts.has(page)) pageStarts.set(page, i)
    }
    if (pageStarts.has(place.page)) {
      wordIndex = pageStarts.get(place.page)!
    } else if (pageStarts.size > 0) {
      let bestPage = -1
      let bestDist = Infinity
      for (const page of pageStarts.keys()) {
        const dist = Math.abs(page - place.page)
        if (dist < bestDist || (dist === bestDist && page < bestPage)) {
          bestDist = dist
          bestPage = page
        }
      }
      wordIndex = pageStarts.get(bestPage)!
    }
  }
  const quote = tokens
    .slice(wordIndex, wordIndex + QUOTE_WORDS)
    .map((t) => t.text)
    .join(' ')
  const tokenPage = tokens[wordIndex]?.page
  return {
    wordIndex,
    quote,
    ...(tokenPage !== undefined && tokenPage >= 0 && { page: tokenPage }),
  }
}

/** The id of a note a person added to a notes file: the same on every
 * device that reads the section, so two reading it at once add one note. */
async function handAddedId(syncId: string, section: ParsedSection): Promise<string> {
  const what = JSON.stringify([syncId, section.place, section.body])
  return `file-${(await sha256(new TextEncoder().encode(what))).slice(0, 32)}`
}

/** Sync readable per-book Markdown notes files in `Notes/` with Drive. */
export async function syncNotesFiles(
  db: RsvpDatabase,
  transport: Transport,
  names: ReadonlySet<string>,
): Promise<{ written: number; applied: number }> {
  const remoteChanges = new Map<string, { text: string; version: string | undefined }>()

  // 1. Read any listed notes file that is new here or whose remote version changed.
  for (const name of names) {
    if (!name.startsWith(NOTES_DIR) || !name.endsWith('.md')) continue
    const record = await getNotesFile(db, name)
    const remoteVersion = transport.versionOf?.(name)
    if (
      record &&
      transport.versionOf &&
      remoteVersion !== undefined &&
      remoteVersion === record.version
    ) {
      continue
    }
    const text = await transport.read(name)
    if (text === null) continue
    if (!record) {
      await putNotesFile(db, {
        name,
        syncId: parseNotesFile(text).book,
        base: text,
        ...(remoteVersion !== undefined && { version: remoteVersion }),
      })
    } else {
      remoteChanges.set(name, { text, version: remoteVersion })
    }
  }

  // 2. Forget files removed from Drive so step 3 recreates them if needed.
  const remainingRecords: NotesFileRecord[] = []
  for (const record of await listNotesFiles(db)) {
    if (!names.has(record.name)) {
      await deleteNotesFile(db, record.name)
    } else {
      remainingRecords.push(record)
    }
  }

  const takenNames = new Set<string>(names)
  for (const record of remainingRecords) takenNames.add(record.name)

  let written = 0
  let applied = 0

  // 3. Apply Drive edits and push updated Markdown for every local book with a syncId.
  for (const book of await db.books.toArray()) {
    const syncId = book.syncId
    if (!syncId || book.id === undefined) continue
    const bookId = book.id
    const [record] = await notesFilesForBook(db, syncId)
    const remote = record ? remoteChanges.get(record.name) : undefined

    if (record && remote && remote.text !== record.base) {
      const baseParsed = parseNotesFile(record.base)
      const remoteParsed = parseNotesFile(remote.text)
      const baseBodies = new Map<string, string>()
      for (const sec of baseParsed.sections) {
        if (sec.noteId !== null) baseBodies.set(sec.noteId, sec.body)
      }
      const existingNotes = new Map((await notesOf(db, bookId)).map((n) => [n.noteId, n]))
      let tokens: Token[] | undefined

      for (const sec of remoteParsed.sections) {
        if (sec.noteId !== null) {
          if (sec.locked) continue
          const note = existingNotes.get(sec.noteId)
          if (!note || note.conflicts.length > 0 || sec.body === '') continue
          const baseBody = baseBodies.get(sec.noteId)
          if (sec.body !== baseBody && sec.body !== note.shown.body) {
            await editNote(db, sec.noteId, sec.body)
            applied++
          }
        } else if (sec.body !== '') {
          tokens ??= (await getTokens(db, bookId)) ?? []
          const id = await handAddedId(syncId, sec)
          // Already here: the other device that read the section sent it.
          if (existingNotes.has(id)) continue
          await addNote(db, bookId, anchorForPlace(sec.place, tokens), sec.body, id)
          applied++
        }
      }
    }

    const notes = await notesOf(db, bookId)
    if (notes.length === 0 && !record) continue

    const rendered = renderNotesFile(
      {
        title: book.title,
        ...(book.author && { author: book.author }),
        syncId,
        totalWords: book.totalWords,
      },
      notes.map((n) => ({
        noteId: n.noteId,
        anchor: n.anchor,
        body: n.shown.body,
        conflicts: n.conflicts.map((c) => ({ body: c.body, at: c.at })),
      })),
    )

    if (!record) {
      const name = readableDriveName(NOTES_DIR, book.title, 'md', syncId, (candidate) =>
        takenNames.has(candidate),
      )
      await transport.write(name, rendered)
      takenNames.add(name)
      const version = transport.versionOf?.(name)
      await putNotesFile(db, {
        name,
        syncId,
        base: rendered,
        ...(version !== undefined && { version }),
      })
      written++
    } else {
      const onDrive = remote ? remote.text : record.base
      if (rendered !== onDrive) {
        await transport.write(record.name, rendered)
        const version = transport.versionOf?.(record.name)
        await putNotesFile(db, {
          name: record.name,
          syncId,
          base: rendered,
          ...(version !== undefined && { version }),
        })
        written++
      } else if (remote) {
        await putNotesFile(db, {
          name: record.name,
          syncId,
          base: remote.text,
          ...(remote.version !== undefined && { version: remote.version }),
        })
      }
    }
  }

  return { written, applied }
}
