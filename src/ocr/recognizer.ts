import { ExtractionError } from '@/parse/errors'
import type { PageRecognizer } from './ocr-pdf'
import { startGuarded } from './startup'
import { ocrToLines } from './words'

export type OcrLanguage = 'eng' | 'tur' | 'eng+tur'

export const OCR_LANGUAGES: { id: OcrLanguage; label: string }[] = [
  { id: 'eng', label: 'English' },
  { id: 'tur', label: 'Türkçe' },
  { id: 'eng+tur', label: 'English + Türkçe' },
]

/** A minimal module that only validates on engines with WebAssembly SIMD,
 * which makes recognition noticeably faster. */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  253, 98, 11,
])

/** Tesseract's LSTM-only engine: the only one the bundled language data
 * (`4.0.0_best_int`) supports. */
const OEM_LSTM_ONLY = 1

// Shipped with the app, never fetched from a CDN: the app has no server.
// vite.config.ts caches these the first time OCR is used (they are ~7-9 MB
// a language, so they are not part of the install), after which it works
// offline; the first use of each language needs a connection.
// scripts/copy-ocr-assets.mjs puts them in /ocr/.
const assetUrl = (path: string) =>
  new URL(`${import.meta.env.BASE_URL}ocr/${path}`, location.href).href

const NOT_AVAILABLE =
  'Text recognition data could not be loaded. It is fetched the first time it is used, ' +
  'so connect to the internet once and try again.'

export interface Recognizer extends PageRecognizer {
  /** Free the engine. Call when the book is done, or cancelled. */
  terminate(): Promise<void>
}

/** Check a file can be fetched, failing with a clear message: if it can
 * not, Tesseract would hang rather than say so. The body is read to the end
 * (not just the headers) so the service worker has finished caching it
 * before Tesseract asks for the same file, instead of fetching it twice. */
async function assertFetchable(url: string): Promise<void> {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(String(response.status))
    await response.arrayBuffer()
  } catch {
    throw new ExtractionError(NOT_AVAILABLE)
  }
}

/** Start Tesseract for `language`. Slow to start (it compiles WebAssembly
 * and parses the language data), so make one per book, not per page. */
export async function createRecognizer(
  language: OcrLanguage,
  options: { signal?: AbortSignal } = {},
): Promise<Recognizer> {
  const core = assetUrl(
    WebAssembly.validate(SIMD_PROBE)
      ? 'tesseract-core-simd-lstm.wasm.js'
      : 'tesseract-core-lstm.wasm.js',
  )
  const languages = language.split('+')
  await Promise.all([
    assertFetchable(assetUrl('worker.min.js')),
    assertFetchable(core),
    ...languages.map((code) => assertFetchable(assetUrl(`lang/${code}.traineddata.gz`))),
  ])

  const { createWorker } = await import('tesseract.js')
  const worker = await startGuarded(
    (errorHandler) =>
      createWorker(languages, OEM_LSTM_ONLY, {
        workerPath: assetUrl('worker.min.js'),
        corePath: core,
        langPath: assetUrl('lang'),
        // The service worker caches these files; a second copy in IndexedDB
        // would only double the storage.
        cacheMethod: 'none',
        errorHandler,
      }),
    { signal: options.signal },
  )

  // One canvas for every page, so a long book does not leave one per page
  // for the garbage collector (iOS caps the total canvas memory).
  const canvas = document.createElement('canvas')

  return {
    async recognize(image) {
      const context = canvas.getContext('2d')
      if (!context) throw new ExtractionError('Could not prepare the page for recognition.')
      canvas.width = image.width
      canvas.height = image.height
      context.putImageData(new ImageData(image.rgba, image.width, image.height), 0, 0)
      const { data } = await worker.recognize(canvas, {}, { blocks: true })
      return ocrToLines(data, image.scale)
    },
    async terminate() {
      canvas.width = canvas.height = 0
      await worker.terminate()
    },
  }
}
