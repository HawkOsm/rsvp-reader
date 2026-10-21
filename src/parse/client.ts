import { pdfClient } from '../pdf/client'
import { formatOfFileName } from './formats'
import type { ParseResult } from './types'
import { reviveError } from './worker-errors'
import type { WorkerRequest, WorkerResponse } from './parse.worker'

export interface ParseFileInWorkerOptions {
  onProgress?: (fraction: number, message?: string) => void
  signal?: AbortSignal
}

/**
 * Main-thread entry point: parse a file off the UI thread. PDFs go to the
 * shared PDF worker (pdf/client.ts). Anything else spins up a
 * fresh dedicated worker per call and terminates it when done, cancelled,
 * or errored — see parse.worker.ts for why one worker only ever handles
 * one file.
 *
 * Not unit-tested here: jsdom has no real Worker implementation, and this
 * function is thin message-passing glue around parseFile() (in index.ts),
 * which has the actual logic and full test coverage. Verified live once
 * wired into the file-import UI (Phase 4).
 */
export function parseFileInWorker(
  file: File,
  options: ParseFileInWorkerOptions = {},
): Promise<ParseResult> {
  // PDFs are read by the shared PDF worker, which also renders the pages.
  if (formatOfFileName(file.name) === 'pdf') return pdfClient.parse(file, options)

  const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' })

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const message: WorkerRequest = { type: 'cancel' }
      worker.postMessage(message)
    }

    const cleanup = () => {
      worker.terminate()
      options.signal?.removeEventListener('abort', onAbort)
    }

    options.signal?.addEventListener('abort', onAbort)

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        options.onProgress?.(message.progress.fraction, message.progress.message)
      } else if (message.type === 'result') {
        cleanup()
        resolve(message.result)
      } else if (message.type === 'error') {
        cleanup()
        reject(reviveError(message.kind, message.message))
      }
    }

    worker.onerror = (event: ErrorEvent) => {
      cleanup()
      reject(new Error(event.message || 'Worker error'))
    }

    const message: WorkerRequest = { type: 'parse', file }
    worker.postMessage(message)
  })
}
