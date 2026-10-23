/** One row of the library list — what the screen shows, not the storage
 * rows behind it (a `books` row plus its `progress` row). */
export interface BookSummary {
  id: number
  title: string
  totalWords: number
  /** PDFs only. */
  pages?: number
  lastOpenedAt: number | null
  /** The saved word index; 0 for a book never read. */
  wordIndex: number
  /** How far through, 0–100. */
  percent: number
}
