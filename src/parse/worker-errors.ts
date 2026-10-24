import type { PdfErrorKind } from '@/pdf/protocol'
import { ExtractionError, NoTextLayerError } from './errors'

// `postMessage` flattens an Error to a string, which would lose the one
// thing the UI needs: whether it is a message worth showing the reader
// ("this PDF is password protected") or an unexpected failure. Workers send
// the kind along, and the main thread rebuilds the right class.

export function describeError(error: unknown): { kind: PdfErrorKind; message: string } {
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof NoTextLayerError) return { kind: 'no-text-layer', message }
  if (error instanceof ExtractionError) return { kind: 'extraction', message }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { kind: 'aborted', message }
  }
  return { kind: 'other', message }
}

export function reviveError(kind: PdfErrorKind, message: string): Error {
  switch (kind) {
    case 'no-text-layer':
      return new NoTextLayerError()
    case 'extraction':
      return new ExtractionError(message)
    case 'aborted':
      return new DOMException(message, 'AbortError')
    default:
      return new Error(message)
  }
}
