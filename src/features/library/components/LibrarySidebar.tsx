import { Icon } from '@/components/Icon'
import type { ShelfRecord } from '@/features/library/api/library'
import type { BookmarkRow } from '@/features/library/bookmarks'
import { SECTIONS, SHELF_DOT, type Section } from '@/features/library/shelf'

const HEADING = 'px-3 text-[11px] font-semibold tracking-wider text-text-dim uppercase'
const ROW = 'flex min-h-10 items-center gap-3 rounded-lg px-3 text-left text-sm'
const rowState = (on: boolean) =>
  on ? 'bg-bg-hover font-medium text-text' : 'text-text-dim hover:bg-bg-hover hover:text-text'

export interface LibrarySidebarProps {
  /** The section picked, or null while a shelf is. */
  section: Section | null
  counts: Record<Section, number>
  onSection: (section: Section) => void
  shelves: ShelfRecord[]
  /** The shelf picked, if one is. */
  shelfId: number | null
  onShelf: (shelfId: number) => void
  onNewShelf: () => void
  bookmarks: BookmarkRow[]
  onBookmark: (mark: BookmarkRow) => void
  onRemoveBookmark: (mark: BookmarkRow) => void
  /** Bytes the browser says the library uses, when it says. */
  usageBytes: number | null
  onSettings: () => void
}

/** The library's side menu: which books to show, how much space they take,
 * and the way to settings. On a phone it sits above the books. */
export function LibrarySidebar({
  section,
  counts,
  onSection,
  shelves,
  shelfId,
  onShelf,
  onNewShelf,
  bookmarks,
  onBookmark,
  onRemoveBookmark,
  usageBytes,
  onSettings,
}: LibrarySidebarProps) {
  return (
    <aside className="flex flex-[1_1_13rem] flex-col gap-5 border-border bg-bg-raised/40 p-4 sm:min-h-screen sm:max-w-64 sm:border-r">
      <div className="flex items-center gap-2.5 px-2 pt-1">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-hover text-sm font-bold"
        >
          r<span className="text-accent">e</span>a
        </span>
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">RSVP Reader</span>
          <span className="text-xs text-text-dim">Local speed reader</span>
        </span>
      </div>

      <nav aria-label="Library sections" className="flex flex-wrap gap-1 sm:flex-col">
        {SECTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={section === value}
            onClick={() => onSection(value)}
            className={`${ROW} ${rowState(section === value)}`}
          >
            <span className="flex-1">{label}</span>
            <span className="text-xs text-text-dim">{counts[value]}</span>
          </button>
        ))}
      </nav>

      <nav aria-labelledby="shelves-heading" className="flex flex-col gap-1">
        <h2 id="shelves-heading" className={HEADING}>
          Shelves
        </h2>
        {shelves.map((shelf) => (
          <button
            key={shelf.id}
            type="button"
            aria-pressed={shelfId === shelf.id}
            onClick={() => onShelf(shelf.id as number)}
            className={`${ROW} ${rowState(shelfId === shelf.id)}`}
          >
            <span aria-hidden className={`h-2 w-2 rounded-full ${SHELF_DOT[shelf.color]}`} />
            <span className="flex-1 truncate">{shelf.name}</span>
            <span className="text-xs text-text-dim">{shelf.bookIds.length}</span>
          </button>
        ))}
        <button type="button" onClick={onNewShelf} className={`${ROW} ${rowState(false)}`}>
          <Icon name="plus" size={14} />
          New shelf
        </button>
      </nav>

      <section aria-labelledby="bookmarks-heading" className="flex flex-col gap-1">
        <h2 id="bookmarks-heading" className={HEADING}>
          Bookmarks
        </h2>
        {bookmarks.length === 0 && (
          <p className="px-3 text-xs text-text-dim">
            Bookmark a word in the reader to find it here.
          </p>
        )}
        <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
          {bookmarks.map((mark) => (
            <li key={mark.id} className="group flex items-start rounded-lg hover:bg-bg-hover">
              <button
                type="button"
                onClick={() => onBookmark(mark)}
                className="flex min-w-0 flex-1 flex-col px-3 py-1.5 text-left"
              >
                <span className="truncate text-sm text-text">{mark.title}</span>
                <span className="truncate text-xs text-text-dim">
                  {mark.percent.toFixed(0)}% · {mark.excerpt}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remove bookmark in ${mark.title}`}
                onClick={() => onRemoveBookmark(mark)}
                className="m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-dim hover:text-accent"
              >
                <Icon name="close" size={13} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-auto flex flex-col gap-2">
        {usageBytes !== null && (
          <p className="hidden rounded-lg border border-border bg-bg-raised p-3 text-xs leading-snug text-text-dim sm:block">
            <span className="mb-1 flex justify-between text-text">
              <span>On this device</span>
              <span className="text-text-dim">{formatBytes(usageBytes)}</span>
            </span>
            No account, no sync. Your books never leave this device.
          </p>
        )}
        <button
          type="button"
          onClick={onSettings}
          className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-text-dim hover:bg-bg-hover hover:text-text"
        >
          <Icon name="settings" size={16} />
          Settings
        </button>
      </div>
    </aside>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${Math.round(bytes / (1024 * 1024))} MB`
}
