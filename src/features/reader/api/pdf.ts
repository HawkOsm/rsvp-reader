import { pdfClient, type PdfHandle } from '@/pdf/client'
import { getBookFile } from './book'

export type { PdfHandle }
export type { Matrix, PageLine, PageSize } from '@/pdf/document'
export {
  screenToTokenPoint,
  screenToUserPoint,
  tokenBoxToScreen,
  userBoxToScreen,
  type Box,
} from '@/pdf/geometry'

/** Open a book's own PDF for reading, or `undefined` if it keeps none. */
export async function openBookPdf(bookId: number): Promise<PdfHandle | undefined> {
  const file = await getBookFile(bookId)
  return file ? pdfClient.open(await file.arrayBuffer()) : undefined
}
