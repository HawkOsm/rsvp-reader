import { useEngine, useEngineIndex } from '../engine-context'

/** The reading-position slider, shared by RSVP and book mode. */
export function ScrubBar() {
  const engine = useEngine()
  const index = useEngineIndex()

  return (
    <input
      type="range"
      min={0}
      max={Math.max(0, engine.count - 1)}
      value={index}
      onChange={(e) => engine.seek(Number(e.target.value))}
      aria-label="Scrub"
      className="w-full accent-[var(--color-accent)]"
    />
  )
}
