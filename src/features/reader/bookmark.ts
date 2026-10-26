/** The words a bookmark shows: a few from the marked one on. */
export function bookmarkExcerpt(
  tokens: readonly { text: string }[],
  index: number,
  words = 8,
): string {
  return tokens
    .slice(index, index + words)
    .map((t) => t.text)
    .join(' ')
}

/** Where to open a book: the word in the link's `?at=`, when it names one
 * inside the book, otherwise where the reader left off. */
export function startIndexFor(at: string | null, saved: number | undefined, count: number): number {
  const asked = at === null || at === '' ? NaN : Number(at)
  if (Number.isInteger(asked) && asked >= 0 && asked < count) return asked
  return saved ?? 0
}
