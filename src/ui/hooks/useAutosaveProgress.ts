import { useEffect } from 'react'
import { getDb } from '../../storage/schema'
import { saveProgress } from '../../storage/library'
import { useEngine } from '../engine-context'
import type { ReadingMode } from '../store'

const SAVE_EVERY_WORDS = 20

/** Writes progress to IndexedDB every ~20 words, on pause, on tab hide, and
 * on leaving the reader (unmount) or closing the tab (beforeunload) —
 * matches the README's "written to disk every 20 words, and again
 * whenever you pause, go back to the library, or close the app". */
export function useAutosaveProgress(bookId: number | null, mode: ReadingMode): void {
  const engine = useEngine()

  useEffect(() => {
    if (bookId === null) return

    let lastSavedIndex = engine.index

    function save() {
      if (bookId === null) return
      void saveProgress(getDb(), bookId, { wordIndex: engine.index, wpm: engine.wpm, mode })
      lastSavedIndex = engine.index
    }

    const offWord = engine.on('word', (index) => {
      if (Math.abs(index - lastSavedIndex) >= SAVE_EVERY_WORDS) save()
    })
    const offPlaying = engine.on('playing', (playing) => {
      if (!playing) save()
    })

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') save()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('beforeunload', save)

    return () => {
      save()
      offWord()
      offPlaying()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('beforeunload', save)
    }
  }, [bookId, mode, engine])
}
