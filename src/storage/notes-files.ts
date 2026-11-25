import type { NotesFileRecord, RsvpDatabase } from './schema'

// Local memory of the readable Markdown notes files on Drive (`Notes/`).

export async function getNotesFile(
  db: RsvpDatabase,
  name: string,
): Promise<NotesFileRecord | undefined> {
  return db.notesFiles.get(name)
}

export async function listNotesFiles(db: RsvpDatabase): Promise<NotesFileRecord[]> {
  return db.notesFiles.toArray()
}

export async function notesFilesForBook(
  db: RsvpDatabase,
  syncId: string,
): Promise<NotesFileRecord[]> {
  const rows = await db.notesFiles.where('syncId').equals(syncId).toArray()
  return rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

export async function putNotesFile(db: RsvpDatabase, record: NotesFileRecord): Promise<void> {
  await db.notesFiles.put(record)
}

export async function deleteNotesFile(db: RsvpDatabase, name: string): Promise<void> {
  await db.notesFiles.delete(name)
}
