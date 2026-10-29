import type { Change } from '@/core/sync/merge'
import { arrayBufferToBase64, base64ToArrayBuffer } from './base64'
import { refoldNote } from './notes'
import {
  normalizeBookRecord,
  type BookRecord,
  type ProgressRecord,
  type RsvpDatabase,
  type SettingRecord,
  type StoredBookRecord,
  type SyncRegisterRecord,
} from './schema'

// One JSON file with books metadata and progress — this is also the
// cross-device sync until cloud sync exists. Tokens are deliberately left
// out: they're cheap to rebuild from the source (the included file, or a
// re-added local file matched by fingerprint) and would otherwise make the
// backup as large as the library itself. Covers are left out for the same
// reason. Notes are in, as their edits: they are the reader's own writing.
// See docs/architecture/decisions.md.

const BACKUP_FORMAT_VERSION = 1

interface BackupFile {
  fileName: string
  mimeType: string
  /** Base64-encoded bytes, so the whole backup is one JSON document. */
  dataBase64: string
}

export interface Backup {
  formatVersion: typeof BACKUP_FORMAT_VERSION
  exportedAt: number
  /** Backups written before `formatId`/`layout` hold `StoredBookRecord`s;
   * `importBackup` brings them up to date. */
  books: (BookRecord | StoredBookRecord)[]
  progress: ProgressRecord[]
  settings: SettingRecord[]
  files?: Record<number, BackupFile>
  /** Every edit of every note (storage/notes.ts): the notes themselves are
   * folded from these. Missing from backups made before notes. */
  noteEdits?: SyncRegisterRecord[]
}

export interface ExportOptions {
  /** Include original file bytes (PDFs, mainly) — makes the backup much
   * bigger but lets a restored library open PDFs offline right away. */
  includeFiles?: boolean
}

export async function exportBackup(db: RsvpDatabase, options: ExportOptions = {}): Promise<Backup> {
  const [books, progress, settings] = await Promise.all([
    db.books.toArray(),
    db.progress.toArray(),
    db.settings.toArray(),
  ])

  const backup: Backup = {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: Date.now(),
    books,
    progress,
    settings,
    noteEdits: await db.syncRegisters.where('key').startsWith('note:').toArray(),
  }

  if (options.includeFiles) {
    const records = await db.files.toArray()
    const files: Record<number, BackupFile> = {}
    for (const record of records) {
      const buffer = await record.blob.arrayBuffer()
      files[record.bookId] = {
        fileName: record.fileName,
        mimeType: record.mimeType,
        dataBase64: arrayBufferToBase64(buffer),
      }
    }
    backup.files = files
  }

  return backup
}

export async function importBackup(db: RsvpDatabase, backup: Backup): Promise<void> {
  if (backup.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Unsupported backup format version: ${backup.formatVersion}`)
  }
  const tables = [
    db.books,
    db.progress,
    db.settings,
    db.files,
    db.covers,
    db.notes,
    db.syncRegisters,
  ]
  await db.transaction('rw', tables, async () => {
    for (const book of backup.books) {
      const restored = normalizeBookRecord(book)
      await db.books.put(restored)
      // Backups hold no covers, and a restored row can take the id of a
      // different book, so whatever cover sat under that id goes.
      if (restored.id !== undefined) await db.covers.delete(restored.id)
    }
    for (const p of backup.progress) await db.progress.put(p)
    for (const s of backup.settings) await db.settings.put(s)
    if (backup.files) {
      for (const [bookIdStr, file] of Object.entries(backup.files)) {
        const bookId = Number(bookIdStr)
        const blob = new Blob([base64ToArrayBuffer(file.dataBase64)], {
          type: file.mimeType,
        })
        await db.files.put({ bookId, blob, fileName: file.fileName, mimeType: file.mimeType })
      }
    }
    // Note edits are immutable, so one already here is the same edit. They
    // are marked to send, in case the device that made them never synced.
    const notes = new Set<string>()
    for (const { key, hlc, change } of backup.noteEdits ?? []) {
      if (change.kind !== 'note' || (await db.syncRegisters.get(key))) continue
      await db.syncRegisters.put({ key, hlc, change: change as Change, pending: 1 })
      notes.add(change.note)
    }
    for (const noteId of notes) await refoldNote(db, noteId)
  })
}
