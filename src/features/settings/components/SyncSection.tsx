import { useSyncPhase, useSyncStore } from '@/stores/sync-store'
import { SMALL_BUTTON } from '@/features/settings/settings-values'
import { connectLabel, syncStatusText } from '@/features/settings/sync-text'
import { Row } from './SettingsControls'

/** Settings → Sync: connect Google Drive, see where sync stands, sync now.
 * Shown only with the `sync` flag on. */
export function SyncSection() {
  const phase = useSyncPhase()
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const error = useSyncStore((s) => s.error)
  const connectError = useSyncStore((s) => s.connectError)
  const connect = useSyncStore((s) => s.connect)
  const disconnect = useSyncStore((s) => s.disconnect)
  const syncNow = useSyncStore((s) => s.syncNow)
  const label = connectLabel(phase)
  const connected = !['unavailable', 'off', 'connecting', 'needs-reconnect'].includes(phase)

  return (
    <>
      <Row
        title="Google Drive"
        hint={
          <span role="status" aria-live="polite">
            {syncStatusText(phase, lastSyncedAt, error, connectError, Date.now())}
          </span>
        }
      >
        {label && (
          <button
            type="button"
            disabled={phase === 'connecting'}
            className={connected ? `${SMALL_BUTTON} hover:text-accent` : SMALL_BUTTON}
            onClick={() => void (connected ? disconnect() : connect())}
          >
            {label}
          </button>
        )}
      </Row>
      {connected && (
        <Row
          title="Sync now"
          hint="Sync also runs when the app opens, after you pause, and every few minutes."
        >
          <button
            type="button"
            disabled={phase === 'syncing'}
            className={SMALL_BUTTON}
            onClick={() => void syncNow()}
          >
            Sync now
          </button>
        </Row>
      )}
      {phase !== 'unavailable' && (
        <p className="px-[18px] py-3.5 text-[13px] leading-snug text-text-dim">
          Your reading positions, settings, shelves and bookmarks are kept in a hidden folder of
          your own Google Drive, so your other devices can pick them up. Book files stay on this
          device. Google can read what is stored there; nothing is sent anywhere else.
        </p>
      )}
    </>
  )
}
