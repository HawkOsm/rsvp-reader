import type { ContentLayout } from '@/core/types'
import { pageLabel, pageOfToken } from '@/features/reader/book-nav'
import { useEngine, useEngineIndex } from '@/features/reader/engine-context'
import { useBookSpread } from '@/features/reader/hooks/useBookSpread'

/** The one quiet line left under the page while book mode's controls are
 * hidden: where the reader is, and how far through. */
export function BookStatus({ layout }: { layout: ContentLayout }) {
  const engine = useEngine()
  const index = useEngineIndex()
  const { layout: spread } = useBookSpread()
  const last = Math.max(1, engine.count - 1)
  const percent = `${Math.round((index / last) * 100)}%`
  return (
    <p
      data-testid="book-status"
      className="pb-[max(0.25rem,env(safe-area-inset-bottom))] text-center text-[11px] text-text-dim tabular-nums"
    >
      {layout.kind === 'paged'
        ? `${pageLabel(pageOfToken(engine.tokens[index]), layout.pages, spread)} · ${percent}`
        : percent}
    </p>
  )
}
