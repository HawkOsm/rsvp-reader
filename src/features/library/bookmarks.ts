import { percentRead } from './progress'

export interface BookmarkRow {
  id: number
  bookId: number
  wordIndex: number
  title: string
  excerpt: string
  /** How far into its book the mark is, 0–100. */
  percent: number
}

/** The sidebar's bookmark list: each mark with its book's title, in the
 * order given. A mark whose book is gone is left out. */
export function bookmarkRows(
  marks: readonly { id?: number; bookId: number; wordIndex: number; excerpt: string }[],
  books: readonly { id?: number; title: string; totalWords: number }[],
): BookmarkRow[] {
  const byId = new Map(books.map((b) => [b.id, b]))
  return marks.flatMap((mark) => {
    const book = byId.get(mark.bookId)
    if (!book) return []
    return [
      {
        id: mark.id as number,
        bookId: mark.bookId,
        wordIndex: mark.wordIndex,
        title: book.title,
        excerpt: mark.excerpt,
        percent: percentRead(book.totalWords, mark.wordIndex),
      },
    ]
  })
}
