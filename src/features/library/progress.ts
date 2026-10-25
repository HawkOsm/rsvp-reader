/** How far through a book a word index is, 0–100. */
export function percentRead(totalWords: number, wordIndex: number | undefined): number {
  if (!wordIndex || totalWords <= 0) return 0
  return Math.min(100, (wordIndex / totalWords) * 100)
}

/** The book to offer under "Continue reading": the first one, in the
 * order given (most recently opened first), that is started but not
 * finished. */
export function bookToContinue<B extends { id?: number; totalWords: number }>(
  books: B[],
  wordIndexOf: (bookId: number) => number | undefined,
): B | undefined {
  return books.find((book) => {
    const percent = percentRead(book.totalWords, wordIndexOf(book.id as number))
    return percent > 0 && percent < 100
  })
}
