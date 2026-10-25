import { useEffect, useRef } from 'react'
import type { BookChapter } from '@/features/reader/api/book'
import { chapterAt } from '@/features/reader/chapters'
import { useEngine, useEngineIndex } from '@/features/reader/engine-context'

export interface ContentsPanelProps {
  chapters: BookChapter[]
  /** After a chapter is picked: a phone closes the panel to show the page. */
  onPicked?: () => void
}

/** The book's chapters, with the one being read marked. Picking one goes
 * to its first word. */
export function ContentsPanel({ chapters, onPicked }: ContentsPanelProps) {
  const engine = useEngine()
  const index = useEngineIndex()
  const current = chapterAt(chapters, index)
  const currentRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [current])

  return (
    <nav
      aria-label="Contents"
      className="flex h-full w-64 max-w-[80vw] flex-col gap-1 overflow-y-auto border-r border-border bg-bg-raised p-3"
    >
      <h2 className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-text-dim uppercase">
        Contents
      </h2>
      {chapters.map((chapter, i) => (
        <button
          key={`${chapter.startTokenIndex}-${i}`}
          ref={i === current ? currentRef : undefined}
          type="button"
          aria-current={i === current ? 'true' : undefined}
          onClick={() => {
            engine.seek(chapter.startTokenIndex)
            onPicked?.()
          }}
          className={`rounded-lg px-2 py-1.5 text-left text-sm ${
            i === current
              ? 'bg-bg-hover font-medium text-text'
              : 'text-text-dim hover:bg-bg-hover hover:text-text'
          }`}
        >
          {chapter.title}
        </button>
      ))}
    </nav>
  )
}
