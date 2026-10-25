import { Icon } from '@/components/Icon'
import type { BookmarkRow } from '@/features/library/bookmarks'

export interface BookmarkListProps {
  bookmarks: BookmarkRow[]
  onOpen: (mark: BookmarkRow) => void
  onRemove: (mark: BookmarkRow) => void
}

/** Every bookmark across the library, newest first. Opening one goes to its
 * word. */
export function BookmarkList({ bookmarks, onOpen, onRemove }: BookmarkListProps) {
  if (bookmarks.length === 0) {
    return (
      <p className="text-sm text-text-dim">
        No bookmarks yet. Bookmark a word in the reader to find it here.
      </p>
    )
  }
  return (
    <ul aria-label="Bookmarks" className="flex flex-col gap-1">
      {bookmarks.map((mark) => (
        <li
          key={mark.id}
          className="flex items-center gap-2 rounded-xl border border-border bg-bg-raised"
        >
          <button
            type="button"
            onClick={() => onOpen(mark)}
            className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
          >
            <span className="text-text-dim">
              <Icon name="bookmark" size={16} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-serif text-[15px]">{mark.title}</span>
              <span className="truncate text-xs text-text-dim">
                {Math.floor(mark.percent)}% · “{mark.excerpt}…”
              </span>
            </span>
          </button>
          <button
            type="button"
            aria-label={`Remove bookmark in ${mark.title}`}
            onClick={() => onRemove(mark)}
            className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-dim hover:bg-bg-hover hover:text-accent"
          >
            <Icon name="close" size={14} />
          </button>
        </li>
      ))}
    </ul>
  )
}
