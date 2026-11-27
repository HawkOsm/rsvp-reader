import { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { wordsOf, type WordRange } from '@/features/reader/selection-words'

/** How long a selection must rest before the button is shown: while it is
 * being dragged out it changes many times a second. */
const SETTLE_MS = 250
/** The menu's width with both choices, and with the note alone. */
const WIDTH = 270
const NOTE_WIDTH = 120
const HEIGHT = 36

const CHOICE =
  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-[13px] whitespace-nowrap text-text hover:bg-bg-hover'

/** Book mode: when words of the book are selected, a small menu by the
 * selection, the way a right-click would offer one: make a note on the
 * words, or, when it is one word, read on from it (a click or a tap on a
 * word picks nothing in book mode, so this is how the place is chosen). Under the selection, where a phone's
 * own copy bar (above it) is not. */
export function SelectionNote({
  onRead,
  onNote,
}: {
  onRead: (words: WordRange) => void
  onNote: (words: WordRange) => void
}) {
  const [found, setFound] = useState<{ words: WordRange; left: number; top: number } | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    function look() {
      const selection = document.getSelection()
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
      const words = range && wordsOf(range)
      if (!range || !words) return setFound(null)
      const box = range.getBoundingClientRect()
      const width = words.start === words.end ? WIDTH : NOTE_WIDTH
      const below = box.bottom + 8
      setFound({
        words,
        left: Math.max(
          8,
          Math.min(window.innerWidth - width - 8, box.left + box.width / 2 - width / 2),
        ),
        // Above the selection when there is no room under it.
        top: below + HEIGHT > window.innerHeight ? Math.max(8, box.top - HEIGHT - 8) : below,
      })
    }
    function onChange() {
      clearTimeout(timer)
      setFound(null)
      timer = setTimeout(look, SETTLE_MS)
    }
    document.addEventListener('selectionchange', onChange)
    return () => {
      document.removeEventListener('selectionchange', onChange)
      clearTimeout(timer)
    }
  }, [])

  if (!found) return null
  // Reading goes on from one word; several are only for a note.
  const one = found.words.start === found.words.end
  const pick = (act: (words: WordRange) => void) => () => {
    act(found.words)
    document.getSelection()?.removeAllRanges()
    setFound(null)
  }
  return (
    <div
      role="menu"
      aria-label="For the selected words"
      // Pressing it must not drop the selection before the click arrives.
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      style={{ left: found.left, top: found.top, width: one ? WIDTH : NOTE_WIDTH, height: HEIGHT }}
      className="fixed z-50 flex gap-0.5 rounded-lg border border-border bg-bg-raised p-0.5 shadow-xl shadow-black/30"
    >
      {one && (
        <button
          type="button"
          role="menuitem"
          className={`${CHOICE} flex-[1.4]`}
          onClick={pick(onRead)}
        >
          <Icon name="play" size={14} />
          Read from here
        </button>
      )}
      <button type="button" role="menuitem" className={CHOICE} onClick={pick(onNote)}>
        <Icon name="note" size={15} />
        Add note
      </button>
    </div>
  )
}
