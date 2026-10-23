import { DEFAULT_WPM } from '@/core/pacing'
import { getRepository, type LibraryRepository } from '@/storage/repository'
import type { OpenedBook, OpenOptions, ReadingPosition } from './types'

/** Opening a book to read, and remembering where the reader got to. */
export class ReadingService {
  private readonly repo: LibraryRepository

  constructor(repo: LibraryRepository) {
    this.repo = repo
  }

  /** Load a book for reading and mark it opened. `null` if it's gone. */
  async open(bookId: number, options: OpenOptions = {}): Promise<OpenedBook | null> {
    const [book, tokens, progress] = await Promise.all([
      this.repo.getBook(bookId),
      this.repo.getTokens(bookId),
      this.repo.getProgress(bookId),
    ])
    if (!book || !tokens) return null

    await this.repo.touchOpened(bookId)
    return {
      id: bookId,
      title: book.title,
      pages: book.pages,
      tokens,
      position: {
        wordIndex: progress?.wordIndex ?? 0,
        wpm: progress?.wpm ?? options.defaultWpm ?? DEFAULT_WPM,
        mode: progress?.mode ?? 'rsvp',
      },
    }
  }

  savePosition(bookId: number, position: ReadingPosition): Promise<void> {
    return this.repo.saveProgress(bookId, position)
  }

  /** The original file's bytes — kept for PDFs only, for the page view. */
  async originalFile(bookId: number): Promise<Blob | null> {
    return (await this.repo.loadFile(bookId)) ?? null
  }
}

let instance: ReadingService | null = null

export function getReadingService(): ReadingService {
  instance ??= new ReadingService(getRepository())
  return instance
}
