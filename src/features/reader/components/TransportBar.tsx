import { memo } from 'react'
import { MAX_WPM, MIN_WPM } from '@/core/pacing'
import type { ContentLayout } from '@/core/types'
import {
  useEngine,
  useEngineIndex,
  useEnginePlaying,
  useEngineWpm,
} from '@/features/reader/engine-context'
import { Button } from '@/components/Button'
import { ScrubBar } from './ScrubBar'
import { WpmInput } from '@/components/WpmInput'

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
    <div className="flex w-full flex-col gap-2 px-4 pb-4">
      <ScrubBar />
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="primary"
          onClick={() => engine.toggle()}
          aria-label={playing ? 'Pause' : 'Play'}
          className="rounded-full! px-4"
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <div className="text-sm text-text-dim" data-testid="word-counter">
          {counterParts.join(' · ')}
        </div>
        <label className="flex items-center gap-2 text-sm text-text-dim">
          WPM
          <input
            type="range"
            min={MIN_WPM}
            max={MAX_WPM}
            step={25}
            value={wpm}
            onChange={(e) => engine.setWpm(Number(e.target.value))}
            aria-label="WPM speed"
            className="w-40 accent-accent"
          />
          <WpmInput
            value={wpm}
            onCommit={(next) => engine.setWpm(next)}
            className="w-16 rounded border border-border bg-bg-raised px-1 py-0.5 text-text"
          />
        </label>
      </div>
    </div>
  )
})
