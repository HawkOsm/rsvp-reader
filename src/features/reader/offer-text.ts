import type { ContentLayout, Token } from '@/core/types'

// What the reader says when another device got further in (or back through)
// the book: "Chrome on Android is 3 pages further on."

/** How far `to` is from `from`, in pages for a paged book and words
 * otherwise, and which way. */
export function offerMessage(
  device: string,
  from: number,
  to: number,
  layout: ContentLayout,
  tokens: readonly Token[],
): string {
  const last = tokens.length - 1
  const at = (index: number) => tokens[Math.max(0, Math.min(last, index))]
  let distance: string
  if (layout.kind === 'paged') {
    const pages = Math.abs((at(to)?.page ?? 0) - (at(from)?.page ?? 0))
    if (pages === 0) return `${device} is further ${to > from ? 'down' : 'up'} this page.`
    distance = `${pages} ${pages === 1 ? 'page' : 'pages'}`
  } else {
    const words = Math.abs(to - from)
    distance = `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`
  }
  return `${device} is ${distance} ${to > from ? 'further on' : 'back'}.`
}
