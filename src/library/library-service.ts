import type { LibraryRepository } from '../storage/repository'
import type { BookRecord, ProgressRecord } from '../storage/schema'
import type { BookSummary } from './types'

/** The library list and what can be done to a book from it. */
export class LibraryService {
  private readonly repo: LibraryRepository

  constructor(repo: LibraryRepository) {
    this.repo = repo
  }

  /** Every book, most recently opened first, with how far through it is. */
  async list(): Promise<BookSummary[]> {
    const [books, progress] = await Promise.all([this.repo.listBooks(), this.repo.listProgress()])
    const byBook = new Map(progress.map((p) => [p.bookId, p]))
    return books.map((book) => summarize(book, byBook.get(book.id as number)))
  }

  /** Back to the first word, keeping the WPM and mode. */
  resetPosition(bookId: number): Promise<void> {
    return this.repo.resetProgress(bookId)
  }

  /** Remove a book and everything stored for it. */
  remove(bookId: number): Promise<void> {
    return this.repo.removeBook(bookId)
  }
}

function summarize(book: BookRecord, progress: ProgressRecord | undefined): BookSummary {
  const wordIndex = progress?.wordIndex ?? 0
  return {
    id: book.id as number,
    title: book.title,
    totalWords: book.totalWords,
    pages: book.pages,
    lastOpenedAt: book.lastOpenedAt,
    wordIndex,
    percent: book.totalWords > 0 ? Math.min(100, (wordIndex / book.totalWords) * 100) : 0,
  }
}
