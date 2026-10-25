import { memo } from 'react'
import { MAX_WPM, MIN_WPM } from '@/core/pacing'
import type { ContentLayout } from '@/core/types'
import {
  useEngine,
  useEngineIndex,
  useEnginePlaying,
  useEngineWpm,
} from '@/features/reader/engine-context'
import { Icon } from '@/components/Icon'
import { ScrubBar } from './ScrubBar'
import { WpmInput } from '@/components/WpmInput'
import { timeLeftLabel } from '@/features/reader/time-left'

/** The same step as the ↑/↓ shortcuts. */
const WPM_STEP = 25
const ROUND =
  'flex h-11 w-11 items-center justify-center rounded-full text-text-dim hover:bg-bg-hover hover:text-text'
const STEP =
  'h-9 w-9 rounded-lg text-lg text-text hover:bg-bg-hover disabled:opacity-40 disabled:hover:bg-transparent'

export interface TransportBarProps {
  /** A paged book gets a "page N / M" segment in the counter. */
  layout: ContentLayout
}

/** Play/pause, scrub bar, word counter and WPM control. */
export const TransportBar = memo(function TransportBar({ layout }: TransportBarProps) {
  const engine = useEngine()
  const index = useEngineIndex()
  const playing = useEnginePlaying()
  const wpm = useEngineWpm()

  const total = engine.count
  const fraction = total > 0 ? index / total : 0
  const currentPage = engine.tokens[index]?.page

  const counterParts = [
    `word ${(index + 1).toLocaleString()} / ${total.toLocaleString()}`,
    `${(fraction * 100).toFixed(1)}%`,
  ]
  if (layout.kind === 'paged' && currentPage !== undefined && currentPage >= 0) {
    counterParts.push(`page ${currentPage + 1} / ${layout.pages}`)
  }

  return (
    <div className="flex w-full flex-col gap-3 px-6 pb-5">
      <div className="flex flex-col gap-1">
        <ScrubBar />
        <div className="flex justify-between gap-4 text-xs text-text-dim tabular-nums">
          <span data-testid="word-counter">{counterParts.join(' · ')}</span>
          <span>{timeLeftLabel(total - index - 1, wpm)} left</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4 sm:grid sm:grid-cols-[1fr_auto_1fr]">
        <div className="hidden sm:block" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => engine.skip(-10)}
            aria-label="Back ten words"
            title="Back ten words  (Shift ←)"
            className={ROUND}
          >
            <Icon name="skipBack" size={20} />
          </button>
          <button
            type="button"
            onClick={() => engine.toggle()}
            aria-label={playing ? 'Pause' : 'Play'}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-bg"
          >
            <Icon name={playing ? 'pause' : 'play'} size={22} />
          </button>
          <button
            type="button"
            onClick={() => engine.skip(10)}
            aria-label="Forward ten words"
            title="Forward ten words  (Shift →)"
            className={ROUND}
          >
            <Icon name="skipForward" size={20} />
          </button>
        </div>
        <div className="flex justify-end">
          <div
            role="group"
            aria-label="Speed"
            className="flex items-center rounded-xl border border-border bg-bg-raised p-0.5 text-sm"
          >
            <button
              type="button"
              onClick={() => engine.setWpm(wpm - WPM_STEP)}
              disabled={wpm <= MIN_WPM}
              aria-label="Slower"
              className={STEP}
            >
              −
            </button>
            <WpmInput
              value={wpm}
              onCommit={(next) => engine.setWpm(next)}
              className="w-14 bg-transparent text-center font-semibold text-text tabular-nums"
            />
            <span className="pr-1 text-xs text-text-dim">wpm</span>
            <button
              type="button"
              onClick={() => engine.setWpm(wpm + WPM_STEP)}
              disabled={wpm >= MAX_WPM}
              aria-label="Faster"
              className={STEP}
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})
