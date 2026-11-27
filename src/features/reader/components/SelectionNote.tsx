import { useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { wordsOf, type WordRange } from '@/features/reader/selection-words'

/** How long a selection must rest before the button is shown: while it is
 * being dragged out it changes many times a second. */
const SETTLE_MS = 250
const WIDTH = 120
const HEIGHT = 36

/** Book mode: when words of the book are selected, a small button by the
 * selection to make a note on them, the way a right-click menu would offer
 * it. Under the selection, where a phone's own copy bar (above it) is not. */
export function SelectionNote({ onNote }: { onNote: (words: WordRange) => void }) {
  const [found, setFound] = useState<{ words: WordRange; left: number; top: number } | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    function look() {
      const selection = document.getSelection()
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
      const words = range && wordsOf(range)
      if (!range || !words) return setFound(null)
      const box = range.getBoundingClientRect()
      const below = box.bottom + 8
      setFound({
        words,
        left: Math.max(
          8,
          Math.min(window.innerWidth - WIDTH - 8, box.left + box.width / 2 - WIDTH / 2),
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
  return (
    <button
      type="button"
      // Pressing it must not drop the selection before the click arrives.
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onNote(found.words)
        document.getSelection()?.removeAllRanges()
        setFound(null)
      }}
      style={{ left: found.left, top: found.top, width: WIDTH, height: HEIGHT }}
      className="fixed z-50 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-bg-raised text-[13px] text-text shadow-xl shadow-black/30 hover:bg-bg-hover"
    >
      <Icon name="note" size={15} />
      Add note
    </button>
  )
}
