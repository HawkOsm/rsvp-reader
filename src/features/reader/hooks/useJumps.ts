import { useCallback, useMemo, useState } from 'react'
import { useEngine } from '@/features/reader/engine-context'
import {
  NO_JUMPS,
  recordJump,
  stepBack,
  stepForward,
  type JumpHistory,
} from '@/features/reader/jump-history'

export interface Jumps {
  /** Go to a word, remembering where the reader was. */
  to: (index: number) => void
  /** Remember this place before something else moves the reader (a drag
   * along the progress line seeks by itself). */
  mark: () => void
  back: () => void
  forward: () => void
  /** Where Back would go, if anywhere. */
  backTo: number | null
  forwardTo: number | null
}

/** The open book's jumps, and going back and forward through them. */
export function useJumps(): Jumps {
  const engine = useEngine()
  const [history, setHistory] = useState<JumpHistory>(NO_JUMPS)

  const mark = useCallback(() => setHistory((h) => recordJump(h, engine.index)), [engine])
  const to = useCallback(
    (index: number) => {
      if (index === engine.index) return
      setHistory((h) => recordJump(h, engine.index))
      engine.seek(index)
    },
    [engine],
  )
  const step = useCallback(
    (take: typeof stepBack) => {
      // Read, then seek: seeking inside the updater would run twice in
      // strict mode.
      const moved = take(history, engine.index)
      if (!moved) return
      setHistory(moved.history)
      engine.seek(moved.to)
    },
    [engine, history],
  )
  const back = useCallback(() => step(stepBack), [step])
  const forward = useCallback(() => step(stepForward), [step])

  return useMemo(
    () => ({
      to,
      mark,
      back,
      forward,
      backTo: history.back[history.back.length - 1] ?? null,
      forwardTo: history.forward[0] ?? null,
    }),
    [to, mark, back, forward, history],
  )
}
