import type { PdfErrorKind } from '../pdf/protocol'
import { parseFile } from './index'
import type { ParseProgress, ParseResult } from './types'
import { describeError } from './worker-errors'

/**
 * The parsing worker's message protocol (text and EPUB; PDFs go to the PDF
 * worker, see pdf/client.ts). One worker handles exactly one
 * file — the client (client.ts) spins up a fresh worker per parse and
 * terminates it afterwards, so there's no job-id multiplexing to get
 * wrong here.
 */
export type WorkerRequest = { type: 'parse'; file: File } | { type: 'cancel' }

export type WorkerResponse =
  | { type: 'progress'; progress: ParseProgress }
  | { type: 'result'; result: ParseResult }
  | { type: 'error'; kind: PdfErrorKind; message: string }

const controller = new AbortController()

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (message.type === 'cancel') {
    controller.abort()
    return
  }

  parseFile(message.file, {
    signal: controller.signal,
    onProgress: (progress) => {
      const response: WorkerResponse = { type: 'progress', progress }
      self.postMessage(response)
    },
  })
    .then((result) => {
      const response: WorkerResponse = { type: 'result', result }
      self.postMessage(response)
    })
    .catch((error: unknown) => {
      const response: WorkerResponse = { type: 'error', ...describeError(error) }
      self.postMessage(response)
    })
}
