import { useEffect, useMemo, useRef, useState } from 'react'
import { useEngine, useEngineIndex } from '@/features/reader/engine-context'
import { followIndex, grow, windowAround } from '@/features/reader/reflow-window'

/** How close (in pixels) to the end of what is rendered a scroll must come
 * before more words are added there. */
const GROW_WITHIN_PX = 1200

/** The book as running text, one column scrolling down like a page, the
 * word being read highlighted. Clicking a word moves the reader there. `book`
 * is the full-width reading view; without it, the small page beside the
 * RSVP word. */
export function TextReflowPanel({ book = false }: { book?: boolean }) {
  const engine = useEngine()
  const index = useEngineIndex()
  const count = engine.count
  const [stored, setStored] = useState(() => ({
    win: windowAround(engine.index, count),
    /** The word the window last followed. */
    index: engine.index,
  }))
  // The window follows the word only when the word changes: a reader who
  // scrolled away from it keeps the page they scrolled to. Done in render,
  // not an effect, so the word is on the page in the same commit that moves
  // to it, ready to scroll to.
  let win = stored.win
  if (stored.index !== index) {
    win = followIndex(stored.win, index, count)
    setStored({ win, index })
  }

  const scrollerRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLSpanElement>(null)
  // Only a new word scrolls the page: growing the window as the reader
  // scrolls must never pull them back.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' })
  }, [index])

  function onScroll() {
    const el = scrollerRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < GROW_WITHIN_PX) {
      setStored((s) => ({ ...s, win: grow(s.win, 'end', count) }))
    } else if (el.scrollTop < GROW_WITHIN_PX) {
      setStored((s) => ({ ...s, win: grow(s.win, 'start', count) }))
    }
  }

  const paragraphs = useMemo(() => {
    const groups: { startIndex: number; words: { text: string; index: number }[] }[] = []
    let current: { startIndex: number; words: { text: string; index: number }[] } | null = null
    for (let i = win.start; i < win.end; i++) {
      const token = engine.tokens[i]
      if (!token) continue
      if (!current) current = { startIndex: i, words: [] }
      current.words.push({ text: token.text, index: i })
      if (token.paraEnd) {
        groups.push(current)
        current = null
      }
    }
    if (current) groups.push(current)
    return groups
  }, [engine, win.start, win.end])

  return (
    <div ref={scrollerRef} onScroll={onScroll} className="h-full overflow-y-auto text-text">
      <div
        className={
          book
            ? 'mx-auto max-w-[38rem] px-6 py-10 font-serif text-[18px] leading-[1.75]'
            : 'p-4 leading-relaxed'
        }
      >
        {paragraphs.map((paragraph) => (
          <p key={paragraph.startIndex} className="mb-4">
            {paragraph.words.map((word, i) => (
              // The word and the space after it, padded to the full line
              // height (inline padding moves nothing), so a click between
              // lines or words still lands on one.
              <span
                key={word.index}
                onClick={() => engine.seek(word.index)}
                className="cursor-pointer py-[0.45em]"
              >
                <span
                  ref={word.index === index ? currentRef : undefined}
                  className={word.index === index ? 'rounded bg-accent px-0.5 text-bg' : undefined}
                >
                  {word.text}
                </span>
                {i < paragraph.words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </p>
        ))}
      </div>
    </div>
  )
}
