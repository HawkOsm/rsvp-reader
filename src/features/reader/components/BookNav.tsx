import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { ContentLayout } from '@/core/types'
import type { BookChapter } from '@/features/reader/api/book'
import {
  firstIndexAt,
  goToPage,
  pageLabel,
  pageOfToken,
  perSpread,
  spreadHasText,
  spreadStart,
  turn,
} from '@/features/reader/book-nav'
import { chapterAt, chapterTicks } from '@/features/reader/chapters'
import { noteDismissal } from '@/features/reader/dismissal'
import { useEngine, useEngineIndex } from '@/features/reader/engine-context'
import { useBookSpread } from '@/features/reader/hooks/useBookSpread'
import type { Jumps } from '@/features/reader/hooks/useJumps'
import { SCALE_STEP } from '@/lib/book-layout'
import { HAS_KEYBOARD, useMediaQuery } from '@/lib/media'
import { useAppStore } from '@/stores/app-store'
import { ScrubBar } from './ScrubBar'

export interface BookNavProps {
  layout: ContentLayout
  chapters: BookChapter[]
  jumps: Jumps
  /** Whether the jump panel is open; the reader holds it, for the G key. */
  open: boolean
  onOpen: (open: boolean) => void
}

const ROW = 'flex items-center justify-between gap-2'
const CHOICE =
  'rounded-lg border border-border px-2.5 py-1.5 text-[13px] text-text hover:bg-bg-hover disabled:opacity-40'
const ARROW =
  'flex h-8 w-9 items-center justify-center rounded-full text-lg text-text-dim hover:bg-bg-hover hover:text-text disabled:opacity-30'

/** Book mode's way around the book. All that stays on screen is one small
 * line under the page: where the reader is, with an arrow each side to turn
 * a paged book. Pressing it opens the jump panel, over the page: go to a
 * page (or how far through), drag along the book, step by chapter, go back
 * to where a jump was made from, and lay the pages out. */
export function BookNav({ layout, chapters, jumps, open, onOpen }: BookNavProps) {
  const engine = useEngine()
  const index = useEngineIndex()
  const { layout: spread } = useBookSpread()
  const rootRef = useRef<HTMLDivElement>(null)
  const paged = layout.kind === 'paged'
  const pageCount = paged ? layout.pages : 0
  const blankPage = useAppStore((s) => s.blankPage)
  const page = spreadStart(blankPage ?? pageOfToken(engine.tokens[index]), spread)
  const last = Math.max(1, engine.count - 1)
  const percent = Math.round((index / last) * 100)
  const chapter = chapters[chapterAt(chapters, index)]

  // A press anywhere else closes the panel, and is nothing more than that;
  // so does Escape, which must not also leave the book.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current?.contains(e.target as Node)) return
      noteDismissal(e)
      onOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      e.preventDefault()
      onOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, onOpen])

  return (
    <div
      ref={rootRef}
      className="relative flex items-center justify-center gap-1 px-2 pt-0.5 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
    >
      {paged && (
        <button
          type="button"
          aria-label="Previous page"
          className={ARROW}
          disabled={page <= 0}
          onClick={() => turn(engine, pageCount, spread, -1)}
        >
          ‹
        </button>
      )}
      <button
        type="button"
        data-testid="book-status"
        aria-label="Go to…"
        aria-expanded={open}
        title="Go to a page, a chapter, or back  (G)"
        onClick={() => onOpen(!open)}
        className={`max-w-[70vw] truncate rounded-full px-3 py-1 text-xs tabular-nums hover:bg-bg-hover hover:text-text ${
          open ? 'bg-bg-hover text-text' : 'text-text-dim'
        }`}
      >
        {paged ? (
          <>
            <span data-testid="book-page-label">{pageLabel(page, pageCount, spread)}</span>
            {` · ${percent}%`}
          </>
        ) : (
          `${percent}%${chapter ? ` · ${chapter.title}` : ''}`
        )}
      </button>
      {paged && (
        <button
          type="button"
          aria-label="Next page"
          className={ARROW}
          disabled={page + perSpread(spread) > pageCount - 1}
          onClick={() => turn(engine, pageCount, spread, 1)}
        >
          ›
        </button>
      )}
      {open && (
        <JumpPanel
          layout={layout}
          chapters={chapters}
          jumps={jumps}
          percent={percent}
          page={page}
          close={() => onOpen(false)}
        />
      )}
    </div>
  )
}

function JumpPanel({
  layout,
  chapters,
  jumps,
  percent,
  page,
  close,
}: {
  layout: ContentLayout
  chapters: BookChapter[]
  jumps: Jumps
  percent: number
  page: number
  close: () => void
}) {
  const engine = useEngine()
  const index = useEngineIndex()
  const { layout: spread, canSpread } = useBookSpread()
  const paged = layout.kind === 'paged'
  const pageCount = paged ? layout.pages : 0
  const last = Math.max(1, engine.count - 1)
  const [typed, setTyped] = useState('')
  const keyboard = useMediaQuery(HAS_KEYBOARD)
  const current = chapterAt(chapters, index)
  // Back a chapter is first back to the start of this one, as in a music
  // player.
  const here = chapters[current]
  const previous = here && index > here.startTokenIndex ? here : chapters[current - 1]
  const next = chapters[current + 1]

  /** The place a word is at, as the reader counts it. */
  const placeOf = (word: number) =>
    paged ? `page ${pageOfToken(engine.tokens[word]) + 1}` : `${Math.round((word / last) * 100)}%`

  function go(event: FormEvent) {
    event.preventDefault()
    const number = Number(typed)
    if (typed.trim() === '' || !Number.isFinite(number)) return
    if (paged) {
      const target = Math.max(1, Math.min(pageCount, Math.round(number))) - 1
      // A page with no words has no place to jump to: it is only shown.
      if (spreadHasText(engine.tokens, spreadStart(target, spread), spread)) {
        useAppStore.getState().setBlankPage(null)
        jumps.to(firstIndexAt(engine.tokens, target, spread))
      } else goToPage(engine, pageCount, spread, target)
    } else {
      jumps.to(Math.round((Math.max(0, Math.min(100, number)) / 100) * last))
    }
    setTyped('')
    close()
  }

  return (
    <div
      role="dialog"
      aria-label="Go to"
      className="absolute bottom-full left-1/2 z-40 mb-1 flex w-80 max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-col gap-3 rounded-2xl border border-border bg-bg-raised p-3.5 text-sm shadow-xl shadow-black/30"
    >
      <form onSubmit={go} className={ROW}>
        <label className="flex items-center gap-2 text-text-dim">
          {paged ? 'Go to page' : 'Go to'}
          <input
            // Ready to type on a computer; on a phone it would throw the
            // keyboard up over the panel before anything was asked for.
            autoFocus={keyboard}
            inputMode="numeric"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={String(paged ? page + 1 : percent)}
            aria-label={paged ? 'Page number' : 'Percent through the book'}
            className="w-16 rounded-lg border border-border bg-bg px-2 py-1 text-center text-text tabular-nums"
          />
          {paged ? `of ${pageCount}` : '%'}
        </label>
        <button type="submit" className={CHOICE} disabled={typed.trim() === ''}>
          Go
        </button>
      </form>

      {/* A drag along the whole book. Where it started is remembered, so
          Back undoes it. */}
      <div onPointerDown={jumps.mark}>
        <ScrubBar ticks={chapterTicks(chapters, engine.count)} />
      </div>

      {chapters.length > 0 && (
        <div className={ROW}>
          <button
            type="button"
            className={CHOICE}
            disabled={!previous}
            title={previous?.title}
            onClick={() => previous && jumps.to(previous.startTokenIndex)}
          >
            ‹ Chapter
          </button>
          <span className="min-w-0 flex-1 truncate text-center text-[13px] text-text-dim">
            {chapters[current]?.title ?? ''}
          </span>
          <button
            type="button"
            className={CHOICE}
            disabled={!next}
            title={next?.title}
            onClick={() => next && jumps.to(next.startTokenIndex)}
          >
            Chapter ›
          </button>
        </div>
      )}

      {(jumps.backTo !== null || jumps.forwardTo !== null) && (
        <div className={ROW}>
          <button
            type="button"
            className={CHOICE}
            disabled={jumps.backTo === null}
            title="Where you were before the last jump  (Alt ←)"
            onClick={jumps.back}
          >
            ↩ Back{jumps.backTo !== null ? ` to ${placeOf(jumps.backTo)}` : ''}
          </button>
          <button
            type="button"
            className={CHOICE}
            disabled={jumps.forwardTo === null}
            title="Forward again  (Alt →)"
            onClick={jumps.forward}
          >
            Forward ↪
          </button>
        </div>
      )}

      {paged && <PageLayout canSpread={canSpread} spread={spread === 'spread'} />}
    </div>
  )
}

/** How a paged book's pages are laid out and sized. */
function PageLayout({ canSpread, spread }: { canSpread: boolean; spread: boolean }) {
  const setBookLayout = useAppStore((s) => s.setBookLayout)
  const scale = useAppStore((s) => s.bookScale)
  const fits = useAppStore((s) => s.bookFits)
  const stepBookScale = useAppStore((s) => s.stepBookScale)
  const fitBook = useAppStore((s) => s.fitBook)
  const atPage = scale !== null && fits !== null && Math.abs(scale - fits.page) < 0.001
  const sameFits = fits !== null && fits.page === fits.width

  const group = (children: ReactNode) => <div className="flex items-center gap-1.5">{children}</div>
  return (
    <div className={`${ROW} border-t border-border pt-3`}>
      {group(
        <>
          {/* A small screen always shows one page. */}
          {canSpread && (
            <button
              type="button"
              className={CHOICE}
              title={
                spread
                  ? 'Show one page instead of a spread  (D)'
                  : 'Show two pages, like an open book  (D)'
              }
              onClick={() => setBookLayout(spread ? 'single' : 'spread')}
            >
              {spread ? 'Single page' : 'Two pages'}
            </button>
          )}
          {/* Nothing to switch between when the two fits are the same size
              and the page is at it. */}
          {(!sameFits || !atPage) && (
            <button
              type="button"
              className={CHOICE}
              title={
                atPage && !sameFits
                  ? 'Fill the width and scroll down  (F)'
                  : 'Show the whole page at once  (F)'
              }
              onClick={fitBook}
            >
              {atPage && !sameFits ? 'Fit width' : 'Fit page'}
            </button>
          )}
        </>,
      )}
      {group(
        <>
          <button
            type="button"
            aria-label="Smaller"
            className={CHOICE}
            onClick={() => stepBookScale(-SCALE_STEP)}
          >
            −
          </button>
          <span
            className="w-11 text-center text-[13px] text-text-dim tabular-nums"
            data-testid="book-scale"
          >
            {Math.round((scale ?? fits?.page ?? 1) * 100)}%
          </span>
          <button
            type="button"
            aria-label="Bigger"
            className={CHOICE}
            onClick={() => stepBookScale(SCALE_STEP)}
          >
            +
          </button>
        </>,
      )}
    </div>
  )
}
