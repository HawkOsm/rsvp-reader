import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

// pdf.js refuses to open anything in a browser without this. Skipped where
// there is no Worker (Node/jsdom tests), where pdf.js falls back to its own
// in-process worker and a Vite asset URL would not resolve.
if (typeof Worker !== 'undefined') {
  GlobalWorkerOptions.workerSrc = workerUrl
}
