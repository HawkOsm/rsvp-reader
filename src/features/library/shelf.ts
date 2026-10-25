// Which books the library shows, and in what order. Pure, so the screen
// only has to render the result.

export type Section = 'all' | 'reading' | 'new' | 'finished'
export type SortKey = 'recent' | 'title' | 'progress'

export const SECTIONS: { value: Section; label: string }[] = [
  { value: 'all', label: 'All books' },
  { value: 'reading', label: 'Reading' },
  { value: 'new', label: 'Not started' },
  { value: 'finished', label: 'Finished' },
]

export const SORTS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Recently read' },
  { value: 'title', label: 'Title' },
  { value: 'progress', label: 'Progress' },
]

/** Where a book with this much read belongs. */
export function sectionOf(percent: number): Exclude<Section, 'all'> {
  if (percent <= 0) return 'new'
  if (percent >= 100) return 'finished'
  return 'reading'
}

export function inSection(section: Section, percent: number): boolean {
  return section === 'all' || sectionOf(percent) === section
}

/** How many books each section holds. */
export function sectionCounts(percents: number[]): Record<Section, number> {
  const counts: Record<Section, number> = { all: percents.length, reading: 0, new: 0, finished: 0 }
  for (const percent of percents) counts[sectionOf(percent)]++
  return counts
}

export interface ShelfOptions {
  section: Section
  query: string
  sort: SortKey
}

/**
 * The books to show: those in the section whose title contains the query
 * (ignoring case and accents), sorted. `books` arrives most recently opened
 * first, which is what 'recent' keeps.
 */
export function shelve<B extends { title: string }>(
  books: B[],
  percentOf: (book: B) => number,
  { section, query, sort }: ShelfOptions,
): B[] {
  const needle = fold(query.trim())
  const shown = books.filter(
    (book) => inSection(section, percentOf(book)) && fold(book.title).includes(needle),
  )
  if (sort === 'title') return shown.sort((a, b) => a.title.localeCompare(b.title))
  if (sort === 'progress') return shown.sort((a, b) => percentOf(b) - percentOf(a))
  return shown
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}
