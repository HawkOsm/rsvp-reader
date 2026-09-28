import { memo, useEffect, useState } from 'react'
import { MAX_WPM, MIN_WPM } from '../../core/pacing'
import { useEngine } from '../engine-context'

export interface TransportBarProps {
  /** Total page count, for the "page N / M" segment of the counter — PDFs
   * only. */
  totalPages?: number
  onWpmChange?: (wpm: number) => void
}

/**
 * Play/pause, scrub bar, word counter and WPM control. Subscribes to the
 * engine directly (its own local state, like RsvpCanvas) rather than
 * taking word-index as a prop, so play/pause/seek only re-renders this bar
 * — never the canvas or the rest of the screen.
 */
export const TransportBar = memo(function TransportBar({
  totalPages,
  onWpmChange,
}: TransportBarProps) {
  const engine = useEngine()
  const [index, setIndex] = useState(engine.index)
  const [playing, setPlaying] = useState(engine.isPlaying)
  const [wpm, setWpmState] = useState(engine.wpm)

  useEffect(() => {
    setIndex(engine.index)
    setPlaying(engine.isPlaying)
    setWpmState(engine.wpm)
    const offWord = engine.on('word', setIndex)
    const offPlaying = engine.on('playing', setPlaying)
    // Picks up a WPM change from anywhere — the arrow-key shortcuts call
    // engine.setWpm() directly, not through this component.
    const offWpm = engine.on('wpm', (next) => {
      setWpmState(next)
      onWpmChange?.(next)
    })
    return () => {
      offWord()
      offPlaying()
      offWpm()
    }
  }, [engine, onWpmChange])

  const total = engine.count
  const fraction = total > 0 ? index / total : 0
  const currentPage = engine.tokens[index]?.page

  function setWpm(next: number) {
    const clamped = Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(next)))
    engine.setWpm(clamped)
  }

  const counterParts = [
    `word ${(index + 1).toLocaleString()} / ${total.toLocaleString()}`,
    `${(fraction * 100).toFixed(1)}%`,
  ]
  if (totalPages !== undefined && currentPage !== undefined && currentPage >= 0) {
    counterParts.push(`page ${currentPage + 1} / ${totalPages}`)
  }

  return (
    <div className="flex w-full flex-col gap-2 px-4 pb-4">
      <input
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        value={index}
        onChange={(e) => engine.seek(Number(e.target.value))}
        aria-label="Scrub"
        className="w-full accent-[var(--color-accent)]"
      />
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => engine.toggle()}
          aria-label={playing ? 'Pause' : 'Play'}
          className="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-[var(--color-bg)]"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <div
          className="text-sm text-[var(--color-text-dim)]"
          data-testid="word-counter"
        >
          {counterParts.join(' · ')}
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-dim)]">
          WPM
          <input
            type="number"
            min={MIN_WPM}
            max={MAX_WPM}
            value={wpm}
            onChange={(e) => setWpm(Number(e.target.value))}
            className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-bg-raised)] px-1 py-0.5 text-[var(--color-text)]"
          />
        </label>
      </div>
    </div>
  )
})
