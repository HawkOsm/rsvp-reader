import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import {
  addNote,
  deleteNote,
  editNote,
  keepBothNotes,
  notesOf,
  settleNote,
  type NoteRecord,
} from '@/features/reader/api/notes'
import { bookmarkExcerpt } from '@/features/reader/bookmark'
import { useEngine, useEngineIndex } from '@/features/reader/engine-context'
import { notePlace, notesFileName, notesMarkdown } from '@/features/reader/notes-markdown'
import { logError } from '@/lib/error-log'
import { getPlatform } from '@/platform'
import { useSyncStore } from '@/stores/sync-store'

const BUTTON =
  'h-8 rounded-md border border-border px-2.5 text-[13px] hover:bg-bg-hover disabled:opacity-60'
const LINK = 'text-[13px] text-text-dim hover:text-text'
const AREA =
  'w-full resize-y rounded-md border border-border bg-bg p-2 text-sm text-text outline-none focus:border-accent'

export interface NotesPanelProps {
  bookId: number
  title: string
  author?: string
  totalWords: number
  onClose: () => void
}

/** A book's notes, beside the reading area: add one on the word being read,
 * jump to one, edit, delete, settle a conflict, export them all. */
export function NotesPanel({ bookId, title, author, totalWords, onClose }: NotesPanelProps) {
  const engine = useEngine()
  const index = useEngineIndex()
  // Read again when sync brings changes in, perhaps to these notes.
  const revision = useSyncStore((s) => s.revision)
  const [notes, setNotes] = useState<NoteRecord[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    notesOf(bookId)
      .then(setNotes)
      .catch((err: unknown) => logError('notes: load', err))
  }, [bookId])
  useEffect(reload, [reload, revision])

  /** Run a change, then show the notes as they now are. */
  async function change(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      logError('notes', err)
      setError(err instanceof Error ? err.message : String(err))
    }
    reload()
  }

  const page = engine.tokens[index]?.page ?? -1
  const here = bookmarkExcerpt(engine.tokens, index, 12)

  return (
    <aside
      aria-label="Notes"
      className="flex h-full w-80 max-w-[85vw] flex-col gap-3 overflow-y-auto border-l border-border bg-bg-raised px-3 py-4"
    >
      <span className="flex items-center justify-between">
        <h2 className="px-1 text-[11px] font-semibold tracking-wider text-text-dim uppercase">
          Notes
        </h2>
        <button
          type="button"
          aria-label="Close notes"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-dim hover:bg-bg-hover hover:text-text"
        >
          <Icon name="close" size={16} />
        </button>
      </span>

      <form
        className="flex flex-col gap-2 rounded-lg border border-border p-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          const body = draft.trim()
          if (!body) return
          const anchor = { wordIndex: index, quote: here, ...(page >= 0 && { page }) }
          void change(() => addNote(bookId, anchor, body)).then(() => setDraft(''))
        }}
      >
        <span className="line-clamp-2 text-[13px] text-text-dim italic">“{here}…”</span>
        <textarea
          aria-label="New note"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="A note on this passage"
          className={AREA}
        />
        <button type="submit" disabled={!draft.trim()} className={`${BUTTON} self-end`}>
          Add note
        </button>
      </form>

      {error && <p className="px-1 text-[13px] text-accent">{error}</p>}

      {notes.length === 0 ? (
        <p className="px-1 text-[13px] text-text-dim">No notes in this book yet.</p>
      ) : (
        <ul aria-label="Notes in this book" className="flex flex-col gap-2">
          {notes.map((note) => (
            <NoteItem
              key={note.noteId}
              note={note}
              place={notePlace(note, totalWords)}
              onGo={() => engine.seek(note.anchor.wordIndex)}
              change={change}
            />
          ))}
        </ul>
      )}

      {notes.length > 0 && <NotesExport title={title} author={author} {...{ notes, totalWords }} />}
    </aside>
  )
}

function NoteItem({
  note,
  place,
  onGo,
  change,
}: {
  note: NoteRecord
  place: string
  onGo: () => void
  change: (action: () => Promise<unknown>) => Promise<void>
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { noteId } = note

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
      <button type="button" onClick={onGo} className="text-left" title="Go to this passage">
        <span className="block text-[11px] font-medium text-text-dim">{place}</span>
        <span className="line-clamp-2 text-[13px] text-text-dim italic">
          “{note.anchor.quote}…”
        </span>
      </button>

      {note.lostDeletes.length > 0 && (
        <div role="status" className="rounded-md bg-bg p-2 text-[13px] text-text-dim">
          This note was deleted on another device while it was being edited, so it was kept.
          <span className="mt-1 flex gap-3">
            <button
              type="button"
              className={LINK}
              onClick={() => void change(() => deleteNote(noteId))}
            >
              Delete it
            </button>
            <button
              type="button"
              className={LINK}
              onClick={() => void change(() => editNote(noteId, note.shown.body))}
            >
              Keep it
            </button>
          </span>
        </div>
      )}

      {note.conflicts.length > 0 ? (
        <Conflict note={note} change={change} />
      ) : editing !== null ? (
        <>
          <textarea
            aria-label="Edit note"
            rows={4}
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            className={AREA}
          />
          <span className="flex justify-end gap-2">
            <button type="button" className={LINK} onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={BUTTON}
              disabled={!editing.trim()}
              onClick={() =>
                void change(() => editNote(noteId, editing.trim())).then(() => setEditing(null))
              }
            >
              Save
            </button>
          </span>
        </>
      ) : (
        <>
          <p className="text-sm whitespace-pre-wrap text-text">{note.shown.body}</p>
          <span className="flex justify-end gap-3">
            {deleting ? (
              <>
                <span className="text-[13px] text-text-dim">Delete this note?</span>
                <button type="button" className={LINK} onClick={() => setDeleting(false)}>
                  No
                </button>
                <button
                  type="button"
                  className={`${LINK} text-accent!`}
                  onClick={() => void change(() => deleteNote(noteId))}
                >
                  Delete
                </button>
              </>
            ) : (
              <>
                <button type="button" className={LINK} onClick={() => setEditing(note.shown.body)}>
                  Edit
                </button>
                <button type="button" className={LINK} onClick={() => setDeleting(true)}>
                  Delete
                </button>
              </>
            )}
          </span>
        </>
      )}
    </li>
  )
}

/** Two devices edited the note at once: show every version, with where and
 * when it was made, and let the reader keep one, keep all, or merge them. */
function Conflict({
  note,
  change,
}: {
  note: NoteRecord
  change: (action: () => Promise<unknown>) => Promise<void>
}) {
  const [merging, setMerging] = useState<string | null>(null)
  const versions = [note.shown, ...note.conflicts]
  const { noteId } = note

  if (merging !== null) {
    return (
      <>
        <textarea
          aria-label="Merged note"
          rows={6}
          value={merging}
          onChange={(e) => setMerging(e.target.value)}
          className={AREA}
        />
        <span className="flex justify-end gap-2">
          <button type="button" className={LINK} onClick={() => setMerging(null)}>
            Cancel
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={!merging.trim()}
            onClick={() => void change(() => settleNote(noteId, merging.trim()))}
          >
            Save
          </button>
        </span>
      </>
    )
  }

  return (
    <div role="group" aria-label="Edited on two devices" className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-accent">
        Edited on {versions.length} devices at once. Which should it be?
      </span>
      {versions.map((version) => (
        <div key={version.edit} className="rounded-md bg-bg p-2">
          <span className="block text-[11px] text-text-dim">
            {new Date(version.at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
          <p className="text-sm whitespace-pre-wrap text-text">{version.body}</p>
          <button
            type="button"
            className={`${LINK} mt-1`}
            onClick={() => void change(() => settleNote(noteId, version.body))}
          >
            Keep this one
          </button>
        </div>
      ))}
      <span className="flex justify-end gap-3">
        <button
          type="button"
          className={LINK}
          onClick={() => void change(() => keepBothNotes(noteId))}
        >
          Keep all, as separate notes
        </button>
        <button
          type="button"
          className={LINK}
          onClick={() => setMerging(versions.map((v) => v.body).join('\n\n'))}
        >
          Merge by hand
        </button>
      </span>
    </div>
  )
}

/** Export: as a file where this device can save one, and always as a copy. */
function NotesExport({
  title,
  author,
  notes,
  totalWords,
}: {
  title: string
  author?: string
  notes: NoteRecord[]
  totalWords: number
}) {
  const [savesFiles, setSavesFiles] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    getPlatform()
      .then((p) => setSavesFiles(p.savesFiles))
      .catch((err: unknown) => logError('notes: platform', err))
  }, [])
  const markdown = () => notesMarkdown({ title, author, totalWords }, notes)

  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
      <span className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${BUTTON} flex items-center gap-1.5`}
          onClick={() => {
            // No clipboard, or it refused: show the text to copy by hand.
            if (!navigator.clipboard) return setShown(true)
            navigator.clipboard.writeText(markdown()).then(
              () => setCopied(true),
              () => setShown(true),
            )
          }}
        >
          <Icon name="note" size={14} />
          {copied ? 'Copied' : 'Copy as Markdown'}
        </button>
        {savesFiles && (
          <button
            type="button"
            className={BUTTON}
            onClick={() =>
              void getPlatform()
                .then((p) => p.saveTextFile(notesFileName(title), markdown(), 'text/markdown'))
                .catch((err: unknown) => logError('notes: export', err))
            }
          >
            Save as .md
          </button>
        )}
      </span>
      {shown && (
        <textarea
          readOnly
          aria-label="Notes as Markdown"
          rows={6}
          value={markdown()}
          onFocus={(e) => e.currentTarget.select()}
          className={AREA}
        />
      )}
    </div>
  )
}
