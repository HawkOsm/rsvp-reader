// When sync runs: one run at a time, however many things ask for one. A
// request made while a run is going gets one more run after it (shared with
// every other request made meanwhile), so a change saved mid-run still goes
// out. Timers are passed in, so this is tested without waiting.

export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export interface SyncRunner {
  /** Run now, or right after the run that is going. Resolves when a run
   * that started after this call has finished. */
  now(): Promise<void>
  /** Run once things have been quiet for a while: for a pause in reading,
   * which can come many times a minute. */
  soon(): void
  /** No more runs. One already going finishes. */
  stop(): void
}

/** `task` is one sync run. It must not reject: it reports its own errors. */
export function createSyncRunner(
  task: () => Promise<void>,
  { timers = globalThis as Timers, quietMs = 5000 }: { timers?: Timers; quietMs?: number } = {},
): SyncRunner {
  let current: Promise<void> | null = null
  let next: Promise<void> | null = null
  let timer: unknown = null
  let stopped = false

  function now(): Promise<void> {
    if (stopped) return Promise.resolve()
    if (!current) {
      current = task().finally(() => (current = null))
      return current
    }
    const after = () => {
      next = null
      return now()
    }
    // After the current run however it ended: its failure is its callers'.
    next ??= current.then(after, after)
    return next
  }

  return {
    now,
    soon() {
      if (stopped) return
      if (timer !== null) timers.clearTimeout(timer)
      timer = timers.setTimeout(() => {
        timer = null
        void now()
      }, quietMs)
    },
    stop() {
      stopped = true
      if (timer !== null) timers.clearTimeout(timer)
      timer = null
    },
  }
}
