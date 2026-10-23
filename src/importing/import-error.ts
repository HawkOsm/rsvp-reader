/** Adding a book failed — an unreadable, encrypted or empty file. The
 * message is written for the reader, so the UI shows it as-is. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}
