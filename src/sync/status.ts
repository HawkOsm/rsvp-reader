import type { SyncAuthState } from '@/platform'
import type { SyncOutcome, SyncRun } from '@/core/sync/run'
import type { SyncResult } from './coordinator'
import { DriveFullError, NeedsReconnectError, OfflineError } from './drive'

// What a sync run came to, for the settings screen and the sync log.

/** What went wrong, sorted into what the user can do about it. */
export function outcomeOf(error: unknown): SyncOutcome {
  if (error instanceof NeedsReconnectError) return 'needs-reconnect'
  if (error instanceof OfflineError) return 'offline'
  if (error instanceof DriveFullError) return 'drive-full'
  return 'error'
}

/** Whether an outcome is a state the app expects to be in now and then,
 * rather than a fault worth the error log. */
export const isExpected = (outcome: SyncOutcome) =>
  outcome === 'synced' || outcome === 'needs-reconnect' || outcome === 'offline'

export function runRecord(
  at: number,
  ms: number,
  result: SyncResult | null,
  error?: unknown,
): SyncRun {
  const run: SyncRun = {
    at,
    ms,
    outcome: error === undefined ? 'synced' : outcomeOf(error),
    sent: result?.pushed ?? 0,
    received: result?.applied ?? 0,
    skewed: result?.skewed ?? 0,
  }
  if (error !== undefined) run.error = error instanceof Error ? error.message : String(error)
  return run
}

/** Where sync stands, as Settings shows it. */
export type SyncPhase =
  | 'unavailable'
  | 'off'
  | 'connecting'
  | 'needs-reconnect'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'drive-full'
  | 'error'

/** The phase, from sign-in (`null` where this shell can't sign in), whether a
 * run is going, and how the last run ended. */
export function phaseOf(
  auth: SyncAuthState | null,
  running: boolean,
  last: SyncOutcome | null,
): SyncPhase {
  if (auth === null) return 'unavailable'
  if (auth === 'signed-out') return 'off'
  if (auth === 'signing-in') return 'connecting'
  if (auth === 'needs-reconnect') return 'needs-reconnect'
  // Just connected: the first run is about to start.
  if (running || last === null) return 'syncing'
  return last
}
