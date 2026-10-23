import { ExtractionError, parseFile } from './index'
import type { ParseProgress, ParseResult } from './types'

/**
 * The parsing worker's message protocol. One worker handles exactly one
 * file — the client (client.ts) spins up a fresh worker per parse and
 * terminates it afterwards, so there's no job-id multiplexing to get
 * wrong here.
 */
export type WorkerRequest = { type: 'parse'; file: File } | { type: 'cancel' }

export type WorkerResponse =
  | { type: 'progress'; progress: ParseProgress }
  | { type: 'result'; result: ParseResult }
  /** `extraction`: the error was an ExtractionError — a message meant for
   * the user. Error classes don't survive postMessage, so this flag
   * carries it across and client.ts rebuilds the class. */
  | { type: 'error'; message: string; extraction: boolean }

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
      const response: WorkerResponse = {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        extraction: error instanceof ExtractionError,
      }
      self.postMessage(response)
    })
}
