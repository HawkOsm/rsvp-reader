import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/Icon'
import type { ShelfRecord } from '@/features/library/api/library'
import { SHELF_DOT } from '@/features/library/shelf'

const ITEM =
  'flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-bg-hover'

export interface BookMenuProps {
  bookId: number
  shelves: ShelfRecord[]
  onShelf: (shelfId: number, on: boolean) => void
  onReset: () => void
  onRemove: () => void
  /** `span` (the default) stretches the menu across the nearest positioned
   * parent; `right` makes it a fixed width, its right edge on that parent's. */
  align?: 'span' | 'right'
}

/** A book tile's "⋯" button and what it opens: its shelves, Reset and
 * Remove. Clicks inside never reach the tile, which would open the book.
 * The menu spans the nearest positioned parent, so put it in the tile's
 * info row: that keeps it inside a narrow tile on a phone. */
export function BookMenu({
  bookId,
  shelves,
  onShelf,
  onReset,
  onRemove,
  align = 'span',
}: BookMenuProps) {
  const [open, setOpen] = useState(false)
  const [shelving, setShelving] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // A click anywhere else, or Escape, closes it.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const close = () => {
    setOpen(false)
    setShelving(false)
  }

  return (
    <div ref={rootRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label="Book actions"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex h-7 w-7 items-center justify-center rounded-md text-text-dim hover:bg-bg-hover hover:text-text"
      >
        <Icon name="more" size={16} />
      </button>
      {open && (
        <div
          role="group"
          aria-label="Book actions"
          className={`absolute bottom-full z-20 mb-1 flex min-w-40 flex-col ${align === 'span' ? 'inset-x-0' : 'right-0 w-52'} gap-0.5 rounded-lg border border-border bg-bg-raised p-1 text-text shadow-lg shadow-black/25`}
        >
          <button
            type="button"
            aria-expanded={shelving}
            onClick={() => setShelving(!shelving)}
            className={ITEM}
          >
            <span className="flex-1">Add to shelf</span>
            <span aria-hidden className="text-text-dim">
              {shelving ? '▾' : '▸'}
            </span>
          </button>
          {shelving && (
            <div className="flex flex-col gap-0.5 border-b border-border pb-1 pl-2">
              {shelves.length === 0 && (
                <p className="px-2.5 py-1.5 text-xs text-text-dim">
                  No shelves yet. Make one with New shelf.
                </p>
              )}
              {shelves.map((shelf) => {
                const on = shelf.bookIds.includes(bookId)
                return (
                  <button
                    key={shelf.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onShelf(shelf.id as number, !on)}
                    className={ITEM}
                  >
                    <span
                      aria-hidden
                      className={`h-2 w-2 rounded-full ${SHELF_DOT[shelf.color]}`}
                    />
                    <span className="flex-1 truncate">{shelf.name}</span>
                    {on && <Icon name="check" size={14} />}
                  </button>
                )
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              close()
              onReset()
            }}
            className={ITEM}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => {
              close()
              onRemove()
            }}
            className={`${ITEM} hover:text-accent`}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  )
}
