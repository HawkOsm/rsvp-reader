import { arrayBufferToBase64, base64ToArrayBuffer } from './base64'
import type { BookRecord, ProgressRecord, RsvpDatabase, SettingRecord } from './schema'

// One JSON file with books metadata and progress — this is also the
// cross-device sync until cloud sync exists. Tokens are deliberately left
// out: they're cheap to rebuild from the source (the included file, or a
// re-added local file matched by fingerprint) and would otherwise make the
// backup as large as the library itself. See DECISIONS.md.

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
  books: BookRecord[]
  progress: ProgressRecord[]
  settings: SettingRecord[]
  files?: Record<number, BackupFile>
}

export interface ExportOptions {
  /** Include original file bytes (PDFs, mainly) — makes the backup much
   * bigger but lets a restored library open PDFs offline right away. */
  includeFiles?: boolean
}

export async function exportBackup(
  db: RsvpDatabase,
  options: ExportOptions = {},
): Promise<Backup> {
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
  await db.transaction(
    'rw',
    db.books,
    db.progress,
    db.settings,
    db.files,
    async () => {
      for (const book of backup.books) await db.books.put(book)
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
    },
  )
}
