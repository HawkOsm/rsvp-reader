// Things lying over a screen that Escape, or Android's back button, should
// close before either does anything else: a panel over the page, a popover.
// Each registers how to close itself while it is open; the last one opened
// is the first closed.

const open: (() => void)[] = []

/** While something is open, say how to close it. Returns how to say it has
 * closed (for an effect's cleanup). */
export function whileOpen(close: () => void): () => void {
  open.push(close)
  return () => {
    const at = open.lastIndexOf(close)
    if (at >= 0) open.splice(at, 1)
  }
}

/** Close the thing opened last, if anything is open. Says whether it did:
 * if not, the key or button is free to do what it usually does. */
export function dismissTop(): boolean {
  const close = open[open.length - 1]
  if (!close) return false
  close()
  return true
}
