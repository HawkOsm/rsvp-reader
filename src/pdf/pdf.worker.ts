import { createPdfService } from './service'
import type { PdfRequest, PdfResponse } from './protocol'

// One worker, one MuPDF instance: it reads PDFs when they are imported and
// keeps the open book for rendering. See service.ts.
const handle = createPdfService((response: PdfResponse, transfer) => {
  self.postMessage(response, { transfer })
})

self.onmessage = (event: MessageEvent<PdfRequest>) => {
  void handle(event.data)
}
