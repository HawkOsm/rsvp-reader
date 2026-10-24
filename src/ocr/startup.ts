import { ExtractionError } from '@/parse/errors'

export interface StartupOptions {
  signal?: AbortSignal
  /** Give up after this long. Starting compiles a few MB of WebAssembly and
   * parses the language data, which is slow on a phone but not minutes. */
  timeoutMs?: number
}

/** The slice of a Tesseract worker this needs. */
interface Stoppable {
  terminate(): Promise<unknown>
}

export const STARTUP_TIMEOUT_MS = 120_000

/**
 * Start something that must be shut down again (a Tesseract worker), without
 * ever hanging.
 *
 * tesseract.js 7 only rejects `createWorker` if the engine itself fails to
 * load. If the language data fails to load, the error goes to `errorHandler`
 * and the promise simply never settles, which would leave the screen on
 * "Starting text recognition" with Cancel doing nothing. So the start is
 * raced against that handler, a timeout and the abort signal, and a worker
 * that finishes starting after one of those has won is terminated rather
 * than leaked.
 */
export async function startGuarded<T extends Stoppable>(
  start: (onError: (error: unknown) => void) => Promise<T>,
  { signal, timeoutMs = STARTUP_TIMEOUT_MS }: StartupOptions = {},
): Promise<T> {
  if (signal?.aborted) throw new DOMException('Parsing cancelled', 'AbortError')

  let reportError: (error: unknown) => void = () => {}
  const failed = new Promise<never>((_, reject) => {
    reportError = (error) =>
      reject(new ExtractionError(`Text recognition could not start: ${describe(error)}`))
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ExtractionError('Text recognition took too long to start.')),
      timeoutMs,
    )
  })
  let onAbort: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new DOMException('Parsing cancelled', 'AbortError'))
    signal?.addEventListener('abort', onAbort)
  })

  let starting: Promise<T> | undefined
  try {
    starting = start(reportError)
    return await Promise.race([starting, failed, timedOut, aborted])
  } catch (error) {
    // Whoever won, the start may still finish: stop what it makes.
    starting?.then(
      (late) => void late.terminate().catch(() => {}),
      () => {},
    )
    throw error
  } finally {
    clearTimeout(timer)
    if (onAbort) signal?.removeEventListener('abort', onAbort)
    // The losers may reject later; that is expected, not unhandled.
    failed.catch(() => {})
    timedOut.catch(() => {})
    aborted.catch(() => {})
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'the engine reported an error'
}
