import type { MouseEvent } from 'react'
import { useEngine } from '../engine-context'

/** Tap the middle third to play/pause, the left/right edges to step one
 * word — returns a click handler for the RSVP canvas's container. A plain
 * `click` (rather than raw pointer events) already ignores drags in every
 * browser, so a scrub-bar drag that starts inside the canvas area doesn't
 * accidentally register as a tap. */
export function useTouchControls() {
  const engine = useEngine()

  return function onTap(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const fraction = (event.clientX - rect.left) / rect.width

    if (fraction < 0.25) engine.skip(-1)
    else if (fraction > 0.75) engine.skip(1)
    else engine.toggle()
  }
}
