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
      className="flex h-full w-64 max-w-[80vw] flex-col gap-0.5 overflow-y-auto border-r border-border bg-bg-raised px-3 py-5"
    >
      <h2 className="px-2.5 pb-2 text-[11px] font-semibold tracking-wider text-text-dim uppercase">
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
          className={`flex min-h-9 items-center rounded-lg px-2.5 text-left text-sm ${
            i === current
              ? 'bg-bg-hover font-semibold text-text'
              : 'text-text-dim hover:bg-bg-hover hover:text-text'
          }`}
        >
          {chapter.title}
        </button>
      ))}
    </nav>
  )
}

/** The name of the chapter being read, for under the book's title; nothing
 * before the first chapter. */
export function ChapterName({ chapters }: { chapters: BookChapter[] }) {
  const index = useEngineIndex()
  const chapter = chapters[chapterAt(chapters, index)]
  if (!chapter) return null
  return (
    <span data-testid="chapter-name" className="max-w-[40vw] truncate text-xs text-text-dim">
      {chapter.title}
    </span>
  )
}
