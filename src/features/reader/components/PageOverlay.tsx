import type { ReactNode } from 'react'
import { aspectOf, type PageSpec } from '@/core/page-spec'
import type { OverlayBox } from '@/features/reader/page-overlay'

interface PageOverlayProps {
  box: OverlayBox
  page: PageSpec
  /** The content is already a page (a PDF's own, with its own paper):
   * draw no container around it. Otherwise it is set on a sheet of paper. */
  plain: boolean
  children: ReactNode
}

/** Bone-coloured paper with dark ink, whatever the app's theme. */
const PAPER_VARS = {
  '--color-bg': '#f4efe3',
  '--color-bg-raised': '#f4efe3',
  '--color-text': '#2a2620',
  '--color-text-dim': '#6b6254',
  '--color-border': '#d8d0bd',
} as React.CSSProperties

/**
 * The page, as a pop-up in the corner of the reading area, inside `box`
 * (which the caller has kept clear of the word).
 *
 * It floats over the screen without changing it, and without catching clicks:
 * everything under it stays clickable. Only the page's own small controls
 * opt back in (`pointer-events-auto`).
 */
export function PageOverlay({ box, page, plain, children }: PageOverlayProps) {
  // Shaped like the book's page, as large as fits the box, in its corner.
  const sheetWidth = Math.min(box.width, box.height * aspectOf(page))
  const sheetHeight = sheetWidth / aspectOf(page)
  return (
    <div
      role="region"
      aria-label="Page view"
      data-plain={plain}
      className="pointer-events-none absolute z-10"
      style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
    >
      <div
        className={`absolute right-0 top-0 overflow-hidden ${plain ? '' : 'rounded-sm border shadow-xl'}`}
        style={
          plain
            ? { width: sheetWidth, height: sheetHeight }
            : {
                ...PAPER_VARS,
                width: sheetWidth,
                height: sheetHeight,
                background: 'var(--color-bg)',
                borderColor: 'var(--color-border)',
              }
        }
      >
        {children}
      </div>
    </div>
  )
}
