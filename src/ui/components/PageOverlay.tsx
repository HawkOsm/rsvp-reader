import type { ReactNode } from 'react'
import type { OverlayBox } from '../page-overlay'

/** The page, floating over the reading area inside `box`, which the caller
 * has kept clear of the word. */
export function PageOverlay({ box, children }: { box: OverlayBox; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label="Page view"
      className="absolute z-10 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-raised)] shadow-xl"
      style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
    >
      {children}
    </div>
  )
}
