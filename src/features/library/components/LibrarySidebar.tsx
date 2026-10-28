import { Icon, type IconName } from '@/components/Icon'
import { useFlag } from '@/lib/flags'
import { formatBytes } from '@/lib/format'
import type { ShelfRecord } from '@/features/library/api/library'
import { SECTIONS, SHELF_DOT, type Section } from '@/features/library/shelf'

/** What the library is showing: a section, a shelf, or the bookmarks. */
export type Place =
  { kind: 'section'; section: Section } | { kind: 'shelf'; shelfId: number } | { kind: 'bookmarks' }

const SECTION_ICONS: Partial<Record<Section, IconName>> = {
  all: 'book',
  reading: 'clock',
  finished: 'check',
}

const HEADING = 'px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-text-dim uppercase'
const ROW = 'flex items-center gap-2.5 rounded-lg px-2.5 text-left'
const rowState = (on: boolean) =>
  on ? 'bg-bg-hover font-medium text-text' : 'text-text-dim hover:bg-bg-hover hover:text-text'

export interface LibrarySidebarProps {
  place: Place
  onPlace: (place: Place) => void
  counts: Record<Section, number>
  bookmarkCount: number
  shelves: ShelfRecord[]
  onNewShelf: () => void
  /** Bytes the browser says the library uses, when it says. */
  usageBytes: number | null
  /** Left out where a tab bar already leads to settings. */
  onSettings?: () => void
}

/** The library's side menu: which books to show, how much space they take,
 * and the way to settings. On a phone it is the Shelves tab. */
export function LibrarySidebar({
  place,
  onPlace,
  counts,
  bookmarkCount,
  shelves,
  onNewShelf,
  usageBytes,
  onSettings,
}: LibrarySidebarProps) {
  const isSection = (s: Section) => place.kind === 'section' && place.section === s
  const sync = useFlag('sync')

  return (
    <aside className="flex min-w-0 flex-[1_1_13rem] flex-col gap-6 border-border bg-bg-raised/40 px-1 py-2 sm:min-h-screen sm:max-w-64 sm:border-r sm:px-3.5 sm:py-5">
      <div className="hidden items-center gap-2.5 px-2 pt-1 sm:flex">
        {/* The app's own icon, the same file as the favicon; precached, so offline too. */}
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">RSVP Reader</span>
          <span className="text-xs text-text-dim">Local speed reader</span>
        </span>
      </div>

      <nav aria-label="Library sections" className="flex flex-col gap-0.5">
        {SECTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={isSection(value)}
            onClick={() => onPlace({ kind: 'section', section: value })}
            className={`${ROW} min-h-10 ${rowState(isSection(value))}`}
          >
            <Icon name={SECTION_ICONS[value] ?? 'book'} size={18} />
            <span className="flex-1">{label}</span>
            <span className="text-xs font-normal text-text-dim">{counts[value]}</span>
          </button>
        ))}
        <button
          type="button"
          aria-pressed={place.kind === 'bookmarks'}
          onClick={() => onPlace({ kind: 'bookmarks' })}
          className={`${ROW} min-h-10 ${rowState(place.kind === 'bookmarks')}`}
        >
          <Icon name="bookmark" size={18} />
          <span className="flex-1">Bookmarks</span>
          <span className="text-xs font-normal text-text-dim">{bookmarkCount}</span>
        </button>
      </nav>

      <nav aria-labelledby="shelves-heading" className="flex flex-col gap-0.5">
        <h2 id="shelves-heading" className={HEADING}>
          Shelves
        </h2>
        {shelves.map((shelf) => {
          const on = place.kind === 'shelf' && place.shelfId === shelf.id
          return (
            <button
              key={shelf.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPlace({ kind: 'shelf', shelfId: shelf.id as number })}
              className={`${ROW} min-h-9 ${rowState(on)}`}
            >
              <span aria-hidden className={`h-2 w-2 rounded-full ${SHELF_DOT[shelf.color]}`} />
              <span className="flex-1 truncate">{shelf.name}</span>
              <span className="text-xs font-normal text-text-dim">{shelf.bookIds.length}</span>
            </button>
          )
        })}
        <button type="button" onClick={onNewShelf} className={`${ROW} min-h-9 ${rowState(false)}`}>
          <Icon name="plus" size={16} />
          New shelf
        </button>
      </nav>

      <div className="mt-auto flex flex-col gap-2.5">
        {usageBytes !== null && (
          <p className="hidden rounded-[10px] border border-border bg-bg-raised p-3 text-xs leading-snug text-text-dim sm:block">
            <span className="mb-1 flex justify-between text-text">
              <span>On this device</span>
              <span className="text-text-dim">{formatBytes(usageBytes)}</span>
            </span>
            {sync
              ? 'Your books stay on this device.'
              : 'No account, no sync. Your books never leave this device.'}
          </p>
        )}
        {onSettings && (
          <button
            type="button"
            onClick={onSettings}
            className={`${ROW} min-h-10 ${rowState(false)}`}
          >
            <Icon name="settings" size={18} />
            Settings
          </button>
        )}
      </div>
    </aside>
  )
}
