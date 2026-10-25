// Which words the reflowed page renders. A whole novel as one flow of
// per-word spans is too much DOM, so the page holds a window of words: it
// follows the word being read, and grows as the reader scrolls on.

export interface ReflowWindow {
  /** First word rendered. */
  start: number
  /** One past the last word rendered. */
  end: number
}

/** Words rendered either side of the current one when the window is placed. */
export const RADIUS = 1500
/** Words added at an edge when the reader scrolls near it. */
export const STEP = 1500
/** The window never holds more than this; growing one side trims the other. */
export const MAX = 6000
/** The window is placed again once the word comes this close to an edge. */
const MARGIN = 200

export function windowAround(index: number, count: number): ReflowWindow {
  return { start: Math.max(0, index - RADIUS), end: Math.min(count, index + RADIUS) }
}

/** The window to show the word at `index`: the same one while the word is
 * well inside it, so reading on never moves the page under the reader. */
export function followIndex(win: ReflowWindow, index: number, count: number): ReflowWindow {
  const nearStart = win.start > 0 && index < win.start + MARGIN
  const nearEnd = win.end < count && index >= win.end - MARGIN
  return nearStart || nearEnd || index < win.start || index >= win.end
    ? windowAround(index, count)
    : win
}

/** The window grown by `STEP` words at one edge, trimmed at the other to
 * stay within `MAX`. The same window when that edge is the book's. */
export function grow(win: ReflowWindow, edge: 'start' | 'end', count: number): ReflowWindow {
  if (edge === 'end') {
    if (win.end >= count) return win
    const end = Math.min(count, win.end + STEP)
    return { start: Math.max(win.start, end - MAX), end }
  }
  if (win.start <= 0) return win
  const start = Math.max(0, win.start - STEP)
  return { start, end: Math.min(win.end, start + MAX) }
}
