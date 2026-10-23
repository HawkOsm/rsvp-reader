import { ExtractionError } from '../parse'
import { fingerprintOf } from '../storage/fingerprint'
import type { LibraryRepository } from '../storage/repository'
import { ImportError } from './import-error'
import type { BookParser, ImportOptions } from './parser'

export interface ImportedBook {
  id: number
  title: string
}

/** Turns a picked or dropped file into a book in the library. */
export class ImportService {
  private readonly repo: LibraryRepository
  private readonly parser: BookParser

  constructor(repo: LibraryRepository, parser: BookParser) {
    this.repo = repo
    this.parser = parser
  }

  /** Parse a file and add it — or, if it's already in the library, return
   * that book. Throws `ImportError` with a message fit to show the user. */
  async importFile(file: File, options: ImportOptions = {}): Promise<ImportedBook> {
    const fingerprint = fingerprintOf(file)

    let result
    try {
      result = await this.parser.parse(file, options)
    } catch (error) {
      if (error instanceof ExtractionError) throw new ImportError(error.message)
      throw new ImportError('Could not add that file.')
    }

    const book = await this.repo.addBook({ title: result.title, source: 'local', fingerprint })
    const bookId = book.id as number
    await this.repo.saveTokens(bookId, result.tokens, fingerprint, result.pages)
    // PDFs keep their bytes so the real page can be drawn offline; there's
    // no file path to reopen later on the web.
    if (file.name.toLowerCase().endsWith('.pdf')) {
      await this.repo.saveFile(bookId, file)
    }
    // Best effort: a refusal only means the browser may evict under pressure.
    void this.repo.requestPersistence().catch(() => false)

    return { id: bookId, title: book.title }
  }
}
