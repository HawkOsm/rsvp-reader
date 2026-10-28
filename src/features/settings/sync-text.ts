import type { SyncPhase } from '@/stores/sync-store'

// What Settings → Sync says, from where sync stands.

/** "14:05" today, "3 Oct, 14:05" another day. */
export function syncedTime(at: number, now: number): string {
  const when = new Date(at)
  const time = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (when.toDateString() === new Date(now).toDateString()) return time
  return `${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`
}

export function syncStatusText(
  phase: SyncPhase,
  lastSyncedAt: number | null,
  /** Why the last run failed. */
  error: string | null,
  /** Why the last sign-in didn't finish. */
  connectError: string | null,
  now: number,
): string {
  const last = lastSyncedAt === null ? '' : ` Last synced ${syncedTime(lastSyncedAt, now)}.`
  switch (phase) {
    case 'unavailable':
      return 'Not available in this version of the app yet.'
    case 'off':
      return connectError ?? 'Not connected.'
    case 'connecting':
      return 'Waiting for Google…'
    case 'needs-reconnect':
      return (connectError ?? 'Paused until you reconnect. Reading carries on as normal.') + last
    case 'syncing':
      return 'Syncing…'
    case 'synced':
      return lastSyncedAt === null ? 'Synced.' : `Synced at ${syncedTime(lastSyncedAt, now)}.`
    case 'offline':
      return `Offline. Changes go out when you’re back online.${last}`
    case 'drive-full':
      return `Your Google Drive is full. Free some space, then press Sync now.${last}`
    case 'error':
      return `Sync failed: ${error ?? 'unknown error'}.${last}`
  }
}

/** The Connect button's label, or `null` for no button. */
export function connectLabel(phase: SyncPhase): string | null {
  switch (phase) {
    case 'unavailable':
      return null
    case 'off':
      return 'Connect Google Drive'
    case 'connecting':
      return 'Connecting…'
    case 'needs-reconnect':
      return 'Reconnect'
    default:
      return 'Disconnect'
  }
}
