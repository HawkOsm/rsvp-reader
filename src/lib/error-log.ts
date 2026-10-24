// A record of what went wrong, kept on this device only: nothing is sent
// anywhere. When something breaks, Settings → Error log shows what, and the
// crash screen offers to copy it. Stored in localStorage rather than
// IndexedDB on purpose: the database may be what is broken.

export interface LoggedError {
  /** When, as a timestamp. */
  at: number
  /** Where it was caught, e.g. "import", "screen", "pdf engine". */
  where: string
  message: string
  stack?: string
  version: string
}

const STORAGE_KEY = 'rsvp-reader:errors'
/** The newest are kept; a log is for "what just happened", not history. */
export const MAX_ENTRIES = 50

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function readErrorLog(): LoggedError[] {
  try {
    const saved = JSON.parse(storage()?.getItem(STORAGE_KEY) ?? '[]') as unknown
    return Array.isArray(saved) ? (saved as LoggedError[]) : []
  } catch {
    return []
  }
}

/** Record an error. Never throws: logging must not become the next crash. */
export function logError(where: string, error: unknown): void {
  try {
    const entry: LoggedError = {
      at: Date.now(),
      where,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      version: __APP_VERSION__,
    }
    const log = readErrorLog()
    const last = log.at(-1)
    // The same error again within a second is one error (a render loop, a
    // retry), not fifty.
    if (last && last.message === entry.message && entry.at - last.at < 1000) return
    storage()?.setItem(STORAGE_KEY, JSON.stringify([...log, entry].slice(-MAX_ENTRIES)))
    console.error(`[${where}]`, error)
  } catch {
    // Storage full or refused: nothing more to do.
  }
}

export function clearErrorLog(): void {
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}

/** The log as plain text, newest first, to copy into a bug report. */
export function formatErrorLog(entries: LoggedError[]): string {
  return [...entries]
    .reverse()
    .map((e) =>
      [`${new Date(e.at).toISOString()}  ${e.where}  (v${e.version})`, e.message, e.stack ?? '']
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n')
}

/** Log errors nothing else caught: uncaught exceptions and rejected promises. */
export function logUncaughtErrors(): () => void {
  const onError = (event: ErrorEvent) => logError('uncaught', event.error ?? event.message)
  const onRejection = (event: PromiseRejectionEvent) => logError('unhandled promise', event.reason)
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
