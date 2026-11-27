// Which of the book's words a text selection covers, in book mode. Reflowed
// text marks each word with its index (`data-word`). A PDF page's selectable
// text is one span a line, laid over a picture, so there the page says which
// word is at a point: `PdfPageView` registers a locator for its element.

/** The words a selection covers, first and last, by index in the book. */
export interface WordRange {
  start: number
  end: number
}

/** A selection may quote this many words; a longer one is cut short. */
export const MAX_NOTE_WORDS = 80

type Locator = (clientX: number, clientY: number) => number | null

const locators = new WeakMap<Element, Locator>()
const PAGE = 'data-pdf-page'

/** Let selections on this page element be traced to words. Returns the undo. */
export function registerPage(element: Element, locate: Locator): () => void {
  locators.set(element, locate)
  element.setAttribute(PAGE, '')
  return () => {
    locators.delete(element)
    element.removeAttribute(PAGE)
  }
}

const elementOf = (node: Node): Element | null =>
  node instanceof Element ? node : node.parentElement

function wordAt(node: Node, x: number, y: number): number | null {
  const element = elementOf(node)
  const marked = element?.closest('[data-word]')
  if (marked) return Number(marked.getAttribute('data-word'))
  const page = element?.closest(`[${PAGE}]`)
  return (page && locators.get(page)?.(x, y)) ?? null
}

/** The words `range` covers, or `null` if it is not over the book's words. */
export function wordsOf(range: Range): WordRange | null {
  if (range.collapsed) return null
  const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0)
  const first = rects[0]
  const last = rects[rects.length - 1]
  // A point just inside each end of what is selected.
  const start = wordAt(
    range.startContainer,
    first ? first.left + 1 : 0,
    first ? first.top + first.height / 2 : 0,
  )
  const end = wordAt(
    range.endContainer,
    last ? last.right - 1 : 0,
    last ? last.top + last.height / 2 : 0,
  )
  const from = start ?? end
  const to = end ?? start
  if (from === null || to === null || !Number.isFinite(from) || !Number.isFinite(to)) return null
  const low = Math.min(from, to)
  return { start: low, end: Math.min(Math.max(from, to), low + MAX_NOTE_WORDS - 1) }
}

/** The words of a range, as a note quotes them. */
export function quoteOf(tokens: readonly { text: string }[], words: WordRange): string {
  return tokens
    .slice(words.start, words.end + 1)
    .map((t) => t.text)
    .join(' ')
}
