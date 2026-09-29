import { memo } from 'react'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  pageLabel,
  pageOfToken,
  perSpread,
  spreadStart,
  turn,
} from '../book-nav'
import { useEngine, useEngineIndex } from '../engine-context'
import { useAppStore } from '../store'
import { Button } from './Button'
import { ScrubBar } from './ScrubBar'

export interface BookControlsProps {
  /** Total PDF pages. */
  pageCount: number
}

/** Book mode's transport: turn pages, and choose how they are laid out.
 * Each toggle is labelled with what it will do next, as in the Python app. */
export const BookControls = memo(function BookControls({ pageCount }: BookControlsProps) {
  const engine = useEngine()
  const index = useEngineIndex()
  const layout = useAppStore((s) => s.bookLayout)
  const fit = useAppStore((s) => s.bookFit)
  const setBookLayout = useAppStore((s) => s.setBookLayout)
  const setBookFit = useAppStore((s) => s.setBookFit)
  const zoom = useAppStore((s) => s.bookZoom)
  const setBookZoom = useAppStore((s) => s.setBookZoom)

  const page = spreadStart(pageOfToken(engine.tokens[index]), layout)
  const spread = layout === 'spread'

  return (
    <div className="flex w-full flex-col gap-2 px-4 pb-2">
      <ScrubBar />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Button
          disabled={page <= 0}
          onClick={() => turn(engine, pageCount, layout, -1)}
        >
          ‹ Previous
        </Button>
        <span className="text-sm text-[var(--color-text-dim)]" data-testid="book-page-label">
          {pageLabel(page, pageCount, layout)}
        </span>
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-dim)]">
          Size
          <input
            type="range"
            min={MIN_ZOOM * 100}
            max={MAX_ZOOM * 100}
            step={ZOOM_STEP * 100}
            value={Math.round(zoom * 100)}
            onChange={(e) => setBookZoom(Number(e.target.value) / 100)}
            aria-label="Page size"
            className="w-32 accent-[var(--color-accent)]"
          />
          <span className="w-10 text-right tabular-nums" data-testid="book-zoom">
            {Math.round(zoom * 100)}%
          </span>
        </label>
        <div className="flex items-center gap-2">
          <Button
            title={spread ? 'Show one page instead of a spread  (D)' : 'Show two pages, like an open book  (D)'}
            onClick={() => setBookLayout(spread ? 'single' : 'spread')}
          >
            {spread ? 'Single page' : 'Two pages'}
          </Button>
          <Button
            title={fit === 'page' ? 'Fill the width and scroll down  (F)' : 'Show the whole spread at once  (F)'}
            onClick={() => setBookFit(fit === 'page' ? 'width' : 'page')}
          >
            {fit === 'page' ? 'Fit width' : 'Fit page'}
          </Button>
          <Button
            disabled={page + perSpread(layout) > pageCount - 1}
            onClick={() => turn(engine, pageCount, layout, 1)}
          >
            Next ›
          </Button>
        </div>
      </div>
    </div>
  )
})
