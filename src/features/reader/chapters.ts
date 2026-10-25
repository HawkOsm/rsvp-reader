// Where the reader is among a book's chapters. Chapters arrive in reading
// order, as the parser found them; a book without any has an empty list.

interface Chapter {
  startTokenIndex: number
}

/** The chapter the word at `index` is in, or -1 before the first one (or
 * for a book with none). */
export function chapterAt(chapters: readonly Chapter[], index: number): number {
  let found = -1
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i]!.startTokenIndex > index) break
    found = i
  }
  return found
}

/** Where to draw a tick on the progress bar for each chapter start, as a
 * fraction of the bar (the same scale as the slider: 0 is the first word,
 * 1 the last). A chapter starting on the first word gets none: the bar's
 * own end is there. */
export function chapterTicks(chapters: readonly Chapter[], count: number): number[] {
  if (count < 2) return []
  return chapters
    .map((c) => c.startTokenIndex / (count - 1))
    .filter((fraction) => fraction > 0 && fraction <= 1)
}

/** How many words are left in the chapter the word at `index` is in,
 * counting neither it nor the next chapter's first word; null before the
 * first chapter. */
export function wordsLeftInChapter(
  chapters: readonly Chapter[],
  index: number,
  count: number,
): number | null {
  const current = chapterAt(chapters, index)
  if (current < 0) return null
  const end = chapters[current + 1]?.startTokenIndex ?? count
  return Math.max(0, end - index - 1)
}
