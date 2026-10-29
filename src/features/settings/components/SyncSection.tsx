import { useState } from 'react'
import { useSyncPhase, useSyncStore } from '@/stores/sync-store'
import { SMALL_BUTTON } from '@/features/settings/settings-values'
import { Switch } from '@/components/Switch'
import { bookFilesText, connectLabel, syncStatusText } from '@/features/settings/sync-text'
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
  const bookFiles = useSyncStore((s) => s.bookFiles)
  const setBookFiles = useSyncStore((s) => s.setBookFiles)
  const upload = useSyncStore((s) => s.upload)
  const usage = useSyncStore((s) => s.usage)
  const bookError = useSyncStore((s) => s.bookError)
  const signInLink = useSyncStore((s) => s.signInLink)
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
      {signInLink && <SignInLinkRow link={signInLink} />}
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
      {connected && (
        <Row title="Book files" hint={bookFilesText(bookFiles, upload, usage, bookError)}>
          <Switch label="Copy books to Google Drive" checked={bookFiles} onChange={setBookFiles} />
        </Row>
      )}
      {phase !== 'unavailable' && (
        <p className="px-[18px] py-3.5 text-[13px] leading-snug text-text-dim">
          Your reading positions, settings, shelves, bookmarks and books are kept in a hidden folder
          of your own Google Drive, so your other devices can pick them up. Google can read what is
          stored there; nothing is sent anywhere else.
        </p>
      )}
    </>
  )
}

/** While a sign-in waits for the browser: its address, for when the browser
 * gets in the way. The app connects wherever the sign-in is finished. */
function SignInLinkRow({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)
  const [shown, setShown] = useState(false)
  return (
    <Row
      title="Sign-in not working?"
      hint={
        <>
          If Google says “Something went wrong”, a privacy extension (an ad blocker or ClearURLs)
          may be in the way. Copy the sign-in link into a private window, or another browser; the
          app connects when you finish there.
          {shown && (
            <input
              readOnly
              aria-label="Sign-in link"
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-2 block w-full rounded-md border border-border bg-bg px-2 py-1 text-xs text-text"
            />
          )}
        </>
      }
    >
      <button
        type="button"
        className={SMALL_BUTTON}
        onClick={() => {
          // No clipboard (or it refused): show the link to copy by hand.
          if (!navigator.clipboard) return setShown(true)
          navigator.clipboard.writeText(link).then(
            () => setCopied(true),
            () => setShown(true),
          )
        }}
      >
        {copied ? 'Copied' : 'Copy sign-in link'}
      </button>
    </Row>
  )
}
