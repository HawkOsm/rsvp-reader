import { openPdf } from '@/pdf/document'
import type { ParseOptions, ParseResult } from '@/parse/types'
import { extractPdf } from './extract'

/** Read a PDF on the current thread. The app does this inside the PDF
 * worker (see `pdf/client.ts`); calling it directly is for tests and
 * anything already off the main thread. */
export async function parsePdf(file: File, options: ParseOptions = {}): Promise<ParseResult> {
  const doc = await openPdf(new Uint8Array(await file.arrayBuffer()))
  try {
    return await extractPdf(doc, file.name, options)
  } finally {
    doc.close()
  }
}
