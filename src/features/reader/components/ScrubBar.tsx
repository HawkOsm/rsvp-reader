import { useEngine, useEngineIndex } from '@/features/reader/engine-context'

/** Half the slider thumb's width: where the track's ends sit for the thumb. */
const THUMB_HALF = 8

/** The reading-position slider, shared by RSVP and book mode. `ticks` marks
 * places on it (chapter starts), as fractions of the slider. */
export function ScrubBar({ ticks = [] }: { ticks?: number[] }) {
  const engine = useEngine()
  const index = useEngineIndex()

  return (
    <div className="relative flex items-center">
      <input
        type="range"
        min={0}
        max={Math.max(0, engine.count - 1)}
        value={index}
        onChange={(e) => engine.seek(Number(e.target.value))}
        aria-label="Scrub"
        className="w-full accent-accent"
      />
      {ticks.map((fraction) => (
        <span
          key={fraction}
          aria-hidden
          data-testid="chapter-tick"
          className="pointer-events-none absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-text-dim"
          style={{
            left: `calc(${fraction} * (100% - ${2 * THUMB_HALF}px) + ${THUMB_HALF}px)`,
          }}
        />
      ))}
    </div>
  )
}
