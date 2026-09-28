/** Mirrors text_extract.py's ExtractionError — a problem worth showing the
 * user a specific message for, as opposed to an unexpected bug. */
export class ExtractionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExtractionError'
  }
}
