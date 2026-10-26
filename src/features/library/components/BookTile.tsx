import type { BookRecord, ShelfRecord } from '@/features/library/api/library'
import { statusLabel } from '@/features/library/shelf'
import { BookCover } from './BookCover'
import { BookMenu } from './BookMenu'

export interface BookTileProps {
  book: BookRecord
  /** How much of it is read, 0–100. */
  percent: number
  shelves: ShelfRecord[]
  onOpen: () => void
  onShelf: (shelfId: number, on: boolean) => void
  onReset: () => void
  onRemove: () => void
}

/** A book in the library grid: its cover, how far in it is, and its menu. */
export function BookTile({
  book,
  percent,
  shelves,
  onOpen,
  onShelf,
  onReset,
  onRemove,
}: BookTileProps) {
  return (
    <li
      onClick={onOpen}
      className="group flex min-w-0 cursor-pointer flex-col gap-2.5"
      data-testid="book-row"
    >
      <div className="shadow-lg shadow-black/25 transition-transform group-hover:-translate-y-1">
        <BookCover book={book} />
      </div>
      <ProgressBar percent={percent} />
      <div className="flex flex-col gap-0.5">
        <div className="relative flex items-start gap-1.5">
          <span
            className="min-w-0 flex-1 truncate text-xs leading-snug font-medium sm:line-clamp-2 sm:text-[13px] sm:whitespace-normal"
            title={book.title}
          >
            {book.title}
          </span>
          <BookMenu
            bookId={book.id as number}
            shelves={shelves}
            onShelf={onShelf}
            onReset={onReset}
            onRemove={onRemove}
          />
        </div>
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-dim sm:text-xs">
          {book.author && (
            <>
              <span className="min-w-0 truncate">{book.author}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span data-testid="book-progress" className="shrink-0">
            {statusLabel(percent)}
          </span>
          {book.ocr && (
            <span
              className="rounded border border-border px-1"
              title="The text was recognised from page images, so expect the odd mistake"
            >
              OCR
            </span>
          )}
        </span>
      </div>
    </li>
  )
}

/** A book in the library list: one row, with a small cover. */
export function BookListRow({
  book,
  percent,
  shelves,
  onOpen,
  onShelf,
  onReset,
  onRemove,
}: BookTileProps) {
  return (
    <li
      onClick={onOpen}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-bg-hover sm:gap-4"
      data-testid="book-row"
    >
      <div className="w-10 shrink-0">
        <BookCover book={book} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="truncate text-sm font-medium" title={book.title}>
          {book.title}
        </span>
        {book.author && <span className="truncate text-xs text-text-dim">{book.author}</span>}
        <div className="flex items-center gap-3">
          <div className="max-w-64 flex-1">
            <ProgressBar percent={percent} />
          </div>
          <span className="w-14 text-xs text-text-dim tabular-nums" data-testid="book-progress">
            {statusLabel(percent)}
          </span>
          {book.ocr && (
            <span
              className="rounded border border-border px-1 text-xs text-text-dim"
              title="The text was recognised from page images, so expect the odd mistake"
            >
              OCR
            </span>
          )}
        </div>
      </div>
      <span className="hidden w-24 text-xs text-text-dim sm:block">
        {book.lastOpenedAt ? new Date(book.lastOpenedAt).toLocaleDateString() : '—'}
      </span>
      <div className="relative">
        <BookMenu
          bookId={book.id as number}
          shelves={shelves}
          onShelf={onShelf}
          onReset={onReset}
          onRemove={onRemove}
          align="right"
        />
      </div>
    </li>
  )
}

/** How far into a book; a finished one's bar goes grey. */
export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1 rounded-full bg-border" aria-hidden>
      <div
        className={`h-1 rounded-full ${percent >= 100 ? 'bg-text-dim' : 'bg-accent'}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
