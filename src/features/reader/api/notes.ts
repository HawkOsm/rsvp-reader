import * as notes from '@/storage/notes'
import { getDb, type NoteRecord } from '@/storage/schema'
import type { NoteAnchor } from '@/core/sync/notes'

// What the reader asks of storage for notes. Every change is recorded for
// sync as it is saved (storage/notes.ts).

export type { NoteAnchor, NoteRecord }

export const notesOf = (bookId: number) => notes.notesOf(getDb(), bookId)
export const addNote = (bookId: number, anchor: NoteAnchor, body: string) =>
  notes.addNote(getDb(), bookId, anchor, body)
export const editNote = (noteId: string, body: string) => notes.editNote(getDb(), noteId, body)
export const deleteNote = (noteId: string) => notes.deleteNote(getDb(), noteId)
export const settleNote = (noteId: string, body: string) => notes.settleNote(getDb(), noteId, body)
export const keepBothNotes = (noteId: string) => notes.keepBothNotes(getDb(), noteId)
