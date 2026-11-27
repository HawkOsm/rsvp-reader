import { useEffect, useMemo, useRef, useState } from 'react'
import { wasDismissal } from '@/features/reader/dismissal'
import { BOOK_SCROLL_ID } from '@/features/reader/book-scroll'
import { useEngine, useEngineIndex } from '@/features/reader/engine-context'
import { followIndex, grow, windowAround } from '@/features/reader/reflow-window'

/** How close (in pixels) to the end of what is rendered a scroll must come
 * before more words are added there. */
const GROW_WITHIN_PX = 1200

/** The first of `items`, which are in order, that `test` passes, found by
 * halving: the words on a page are thousands, and each test measures one. */
function firstFrom<T>(items: T[], test: (item: T) => boolean): T | undefined {
  let low = 0
  let high = items.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (test(items[mid] as T)) high = mid
    else low = mid + 1
  }
  return items[low]
}

/** How long a scroll must rest before the reader's place follows it. */
const SETTLE_MS = 200

/** The book as running text, one column scrolling down like a page, the
 * word being read highlighted. Clicking a word moves the reader there. `book`
 * is the full-width reading view; without it, the small page beside the
 * RSVP word. In the reading view the reader's place also follows the
 * scrolling, so reading on by scrolling is remembered like any other. */
export function TextReflowPanel({
  book = false,
  onControls,
}: {
  book?: boolean
  /** Reading view only: a finger asked for the reader's controls (a tap), or
   * scrolled on, which hides them. A finger's tap picks no word. */
  onControls?: (show: 'toggle' | false) => void
}) {
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
  /** The word the place was last moved to by scrolling, if it still is the
   * place: that word is not marked, and moving to it moves nothing. */
  const [scrolledTo, setScrolledTo] = useState<number | null>(null)
  let win = stored.win
  if (stored.index !== index) {
    // A place that followed the scrolling is on the page already: placing
    // the window again around it would move the text under the reader.
    const inPlace = index === scrolledTo && index >= win.start && index < win.end
    if (!inPlace) win = followIndex(stored.win, index, count)
    // Moved on some other way (keys, the bar, playing): a place like any
    // other again, marked when the reader comes back to it.
    if (scrolledTo !== null && index !== scrolledTo) setScrolledTo(null)
    setStored({ win, index })
  }

  const scrollerRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLSpanElement>(null)
  /** The page is being scrolled to the current word, not by the reader: the
   * place must not follow that scroll (it would slide back to the top of
   * the screen, half a screen before the word just jumped to), nor may it
   * hide the controls a finger is using to jump. */
  const ownScroll = useRef(false)
  // Only a new word scrolls the page: growing the window as the reader
  // scrolls must never pull them back. Beside the RSVP word it is kept in
  // the middle; in the reading view the page moves only for a word that is
  // out of sight, so picking a word on the page doesn't make it lurch.
  useEffect(() => {
    const word = currentRef.current
    const area = scrollerRef.current
    if (!word || !area) return
    if (book) {
      const w = word.getBoundingClientRect()
      const a = area.getBoundingClientRect()
      if (w.top >= a.top && w.bottom <= a.bottom) return
    }
    const before = area.scrollTop
    word.scrollIntoView({ block: 'center' })
    if (area.scrollTop !== before) ownScroll.current = true
  }, [index, book])

  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(settle.current), [])
  /** Move the reader's place to the first word in view. */
  function followScroll() {
    const area = scrollerRef.current
    if (!area) return
    const top = area.getBoundingClientRect().top
    const words = [...area.querySelectorAll<HTMLElement>('[data-word]')]
    // At the very bottom of the book the place is its last word: the book
    // has been read, though that word is never first on the screen.
    const atBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 2
    const last = words[words.length - 1]
    const word =
      atBottom && Number(last?.dataset.word) === count - 1
        ? last
        : firstFrom(words, (span) => span.getBoundingClientRect().top >= top)
    const at = Number(word?.dataset.word)
    if (!word || at === engine.index) return
    setScrolledTo(at)
    engine.seek(at)
  }

  /** Whether the last thing to touch the page was a finger. */
  const byFinger = useRef(false)
  /** The press under way closed a popover: it is no tap on the page. */
  const dismissing = useRef(false)

  function onScroll() {
    const el = scrollerRef.current
    if (!el) return
    if (ownScroll.current) {
      ownScroll.current = false
      clearTimeout(settle.current)
    } else {
      if (byFinger.current) onControls?.(false)
      if (book) {
        clearTimeout(settle.current)
        settle.current = setTimeout(followScroll, SETTLE_MS)
      }
    }
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
    <div
      ref={scrollerRef}
      id={book ? BOOK_SCROLL_ID : undefined}
      onScroll={onScroll}
      onPointerDown={(e) => {
        byFinger.current = e.pointerType === 'touch'
        dismissing.current = wasDismissal(e.nativeEvent)
      }}
      onClick={() => {
        if (byFinger.current && !dismissing.current) onControls?.('toggle')
      }}
      className="h-full overflow-y-auto text-text"
    >
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
                data-word={word.index}
                // Beside the RSVP word, a click picks the word to read on
                // from (not when it ends a text selection). In book mode a
                // click picks nothing: selecting a word offers that instead.
                onClick={() => {
                  if (book) return
                  if (dismissing.current || !window.getSelection()?.isCollapsed) return
                  setScrolledTo(null)
                  engine.seek(word.index)
                }}
                className={book ? 'py-[0.45em]' : 'cursor-pointer py-[0.45em]'}
              >
                <span
                  ref={word.index === index ? currentRef : undefined}
                  className={
                    word.index === index && index !== scrolledTo
                      ? 'rounded bg-(--reader-mark) px-0.5 text-bg'
                      : undefined
                  }
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
