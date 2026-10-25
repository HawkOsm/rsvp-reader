import { SHELF_COLORS, type ShelfColor } from '@/features/library/api/library'

// Which books the library shows, and in what order. Pure, so the screen
// only has to render the result.

export type Section = 'all' | 'reading' | 'new' | 'finished'
export type SortKey = 'recent' | 'title' | 'progress'

/** The sidebar's sections. "Not started" is a filter chip instead. */
export const SECTIONS: { value: Section; label: string }[] = [
  { value: 'all', label: 'All books' },
  { value: 'reading', label: 'Reading now' },
  { value: 'finished', label: 'Finished' },
]

/** The chips over the grid: by how much is read, or by format. */
export type Filter = Section | 'epub' | 'pdf'

export const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'reading', label: 'Reading' },
  { value: 'new', label: 'New' },
  { value: 'finished', label: 'Finished' },
  { value: 'epub', label: 'EPUB' },
  { value: 'pdf', label: 'PDF' },
]

/** Under a book's title: "New", "Finished", or how far in, never rounded
 * up to a "100%" that isn't finished. */
export function statusLabel(percent: number): string {
  if (percent <= 0) return 'New'
  if (percent >= 100) return 'Finished'
  return `${Math.floor(percent)}%`
}

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
  /** The book ids of the shelf picked in the sidebar, if one is. */
  shelfBookIds?: readonly number[]
  /** The chip picked over the grid; none is the same as 'all'. */
  filter?: Filter
}

function passes(filter: Filter, percent: number, formatId: string | undefined): boolean {
  if (filter === 'epub' || filter === 'pdf') return formatId === filter
  return inSection(filter, percent)
}

/**
 * The books to show: those in the section (and on the shelf, and through
 * the chip) whose title contains the query
 * (ignoring case and accents), sorted. `books` arrives most recently opened
 * first, which is what 'recent' keeps.
 */
export function shelve<B extends { id?: number; title: string; formatId?: string }>(
  books: B[],
  percentOf: (book: B) => number,
  { section, query, sort, shelfBookIds, filter = 'all' }: ShelfOptions,
): B[] {
  const needle = fold(query.trim())
  const shown = books.filter(
    (book) =>
      inSection(section, percentOf(book)) &&
      passes(filter, percentOf(book), book.formatId) &&
      (!shelfBookIds || shelfBookIds.includes(book.id as number)) &&
      fold(book.title).includes(needle),
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

/** The dot class for each shelf colour, written out so Tailwind sees it. */
export const SHELF_DOT: Record<ShelfColor, string> = {
  accent: 'bg-accent',
  'shelf-blue': 'bg-shelf-blue',
  'shelf-green': 'bg-shelf-green',
  'shelf-amber': 'bg-shelf-amber',
  'shelf-violet': 'bg-shelf-violet',
}

/** The colour a new shelf starts with: the first one no shelf has yet, or
 * round again once all are taken. */
export function nextShelfColor(taken: readonly ShelfColor[]): ShelfColor {
  const free = SHELF_COLORS.find((color) => !taken.includes(color))
  return free ?? SHELF_COLORS[taken.length % SHELF_COLORS.length]!
}
