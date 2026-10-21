/** Mirrors text_extract.py's ExtractionError — a problem worth showing the
 * user a specific message for, as opposed to an unexpected bug. */
export class ExtractionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExtractionError'
  }
}

/** A PDF with pages but no text to read: a scan or a photo of a page. The
 * one extraction failure the app can do something about (run OCR), so it
 * gets its own type. */
export class NoTextLayerError extends ExtractionError {
  constructor() {
    super('This PDF has no text layer.')
    this.name = 'NoTextLayerError'
  }
}
