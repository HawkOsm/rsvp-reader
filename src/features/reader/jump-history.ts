// Where the reader was before each jump (a page typed in, a chapter picked,
// a drag along the progress line), so a jump can be undone: back, and
// forward again. Plain data; hooks/useJumps.ts keeps it for the open book.

export interface JumpHistory {
  /** Places left by a jump, oldest first. */
  back: number[]
  /** Places gone back from, nearest first. */
  forward: number[]
}

export const NO_JUMPS: JumpHistory = { back: [], forward: [] }

/** No more places than this are remembered; the oldest go first. */
const MAX = 50

/** The history after jumping away from `from`. Jumping away from the same
 * place twice remembers it once. */
export function recordJump(history: JumpHistory, from: number): JumpHistory {
  if (history.back[history.back.length - 1] === from && history.forward.length === 0) {
    return history
  }
  return { back: [...history.back, from].slice(-MAX), forward: [] }
}

/** Go back from `at` to the place before the last jump, if there is one. */
export function stepBack(
  history: JumpHistory,
  at: number,
): { history: JumpHistory; to: number } | null {
  const to = history.back[history.back.length - 1]
  if (to === undefined) return null
  return { history: { back: history.back.slice(0, -1), forward: [at, ...history.forward] }, to }
}

/** Go forward again from `at`, after going back. */
export function stepForward(
  history: JumpHistory,
  at: number,
): { history: JumpHistory; to: number } | null {
  const to = history.forward[0]
  if (to === undefined) return null
  return { history: { back: [...history.back, at], forward: history.forward.slice(1) }, to }
}
