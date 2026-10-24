import { pdfClient } from '@/pdf/client'
import type { ParseResult } from '@/parse/types'
import { extractByOcr } from './ocr-pdf'
import { createRecognizer, type OcrLanguage } from './recognizer'

export type { OcrLanguage } from './recognizer'
export { OCR_LANGUAGES } from './recognizer'

export interface OcrOptions {
  language: OcrLanguage
  onProgress?: (fraction: number, message?: string) => void
  signal?: AbortSignal
}

/** Read a scanned PDF by recognising its pages: they are drawn by the PDF
 * worker and read by Tesseract. */
export async function ocrPdfFile(file: File, options: OcrOptions): Promise<ParseResult> {
  options.onProgress?.(0, 'Starting text recognition')
  const pdf = await pdfClient.open(await file.arrayBuffer())
  try {
    const recognizer = await createRecognizer(options.language, { signal: options.signal })
    try {
      return await extractByOcr(pdf, recognizer, file.name, {
        signal: options.signal,
        onProgress: ({ fraction, message }) => options.onProgress?.(fraction, message),
      })
    } finally {
      await recognizer.terminate()
    }
  } finally {
    pdf.close()
  }
}
