import { useEngine, useEngineIndex } from '@/features/reader/engine-context'

/** The reading-position bar, shared by RSVP and book mode: a slim track with
 * a notch at each of `ticks` (chapter starts, as fractions of the bar). A
 * native slider lies over it, unseen, so it drags and takes the keyboard
 * like any other. */
export function ScrubBar({ ticks = [] }: { ticks?: number[] }) {
  const engine = useEngine()
  const index = useEngineIndex()
  const last = Math.max(0, engine.count - 1)
  const fraction = last > 0 ? index / last : 0
  const at = (f: number) => `${f * 100}%`

  return (
    <div className="relative h-[18px]">
      <div aria-hidden className="absolute inset-x-0 top-[7px] h-1 rounded-full bg-border" />
      <div
        aria-hidden
        className="absolute top-[7px] left-0 h-1 rounded-full bg-accent"
        style={{ width: at(fraction) }}
      />
      {ticks.map((f) => (
        <span
          key={f}
          aria-hidden
          data-testid="chapter-tick"
          className="absolute top-[5px] -ml-px h-2 w-0.5 bg-bg"
          style={{ left: at(f) }}
        />
      ))}
      <span
        aria-hidden
        className="absolute top-0.5 -ml-[7px] h-3.5 w-3.5 rounded-full bg-text shadow-[0_0_0_4px_rgba(255,255,255,0.08)]"
        style={{ left: at(fraction) }}
      />
      <input
        type="range"
        min={0}
        max={last}
        value={index}
        onChange={(e) => engine.seek(Number(e.target.value))}
        aria-label="Scrub"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  )
}
