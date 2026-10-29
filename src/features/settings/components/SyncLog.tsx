import { useEffect, useState } from 'react'
import { thisDeviceId } from '@/features/settings/api/sync'
import { SMALL_BUTTON } from '@/features/settings/settings-values'
import { syncedTime } from '@/features/settings/sync-text'
import { logError } from '@/lib/error-log'
import { formatSyncLog, readSeenDevices, readSyncRuns } from '@/lib/sync-runs'
import { DORMANT_MS, useSyncStore } from '@/stores/sync-store'
import { Row } from './SettingsControls'

const OUTCOMES = {
  synced: 'Synced',
  'needs-reconnect': 'Needs reconnect',
  offline: 'Offline',
  'drive-full': 'Drive full',
  error: 'Failed',
} as const

/** Settings → Sync log: recent sync runs and the devices seen, kept on this
 * device, with "Copy log" for bug reports (docs/architecture/sync.md,
 * decision 15). */
export function SyncLog() {
  // Subscribed so the log is read again whenever a run starts or finishes,
  // or a device is removed.
  useSyncStore((s) => s.running)
  useSyncStore((s) => s.revision)
  const removeDevice = useSyncStore((s) => s.removeDevice)
  const runs = readSyncRuns()
  const devices = readSeenDevices()
  const [device, setDevice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    thisDeviceId()
      .then(setDevice)
      .catch((err: unknown) => logError('sync log', err))
  }, [])
  const now = Date.now()

  return (
    <>
      <Row title="Sync log" hint="The last 50 sync runs, kept on this device only.">
        <button
          type="button"
          className={SMALL_BUTTON}
          onClick={() =>
            void navigator.clipboard
              ?.writeText(formatSyncLog(device ?? '?', devices, runs, __APP_VERSION__))
              .then(() => setCopied(true))
          }
        >
          {copied ? 'Copied' : 'Copy log'}
        </button>
      </Row>
      <div className="flex flex-col gap-1 px-[18px] py-3.5 text-[13px]">
        <span className="font-medium">Devices</span>
        <span className="text-text-dim">
          Remove a device you no longer use, so old changes can be cleared from Drive without
          waiting for it. If it syncs again, it comes back.
        </span>
        <span className="text-text-dim">
          This device: <code className="break-all">{device ?? '…'}</code>
        </span>
        {devices.length === 0 ? (
          <span className="text-text-dim">No other devices.</span>
        ) : (
          <ul aria-label="Other devices" className="flex flex-col gap-0.5 text-text-dim">
            {devices.map((d) => (
              <li key={d.device} className="flex flex-wrap items-center gap-x-3">
                <span className="text-text">{d.name ?? 'Unnamed device'}</span>
                <span className="flex-1">
                  last seen {syncedTime(d.lastSeen, now)}
                  {now - d.lastSeen > DORMANT_MS && ' · dormant'}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${d.name ?? 'device'} ${d.device.slice(0, 8)}`}
                  className="rounded px-1.5 py-0.5 hover:bg-bg-hover hover:text-accent"
                  onClick={() => void removeDevice(d.device)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="px-[18px] py-3.5">
        {runs.length === 0 ? (
          <span className="text-[13px] text-text-dim">No sync runs yet.</span>
        ) : (
          <ol
            aria-label="Sync runs"
            className="flex max-h-72 flex-col divide-y divide-border overflow-auto rounded-lg bg-bg text-[13px]"
          >
            {[...runs].reverse().map((run) => (
              <li key={run.at} className="flex flex-col gap-0.5 px-3 py-2">
                <div className="flex flex-wrap justify-between gap-x-3">
                  <span className={run.outcome === 'synced' ? 'text-text' : 'text-accent'}>
                    {OUTCOMES[run.outcome]}
                  </span>
                  <span className="text-text-dim tabular-nums">{syncedTime(run.at, now)}</span>
                </div>
                <span className="text-text-dim tabular-nums">
                  sent {run.sent} · received {run.received}
                  {run.skewed > 0 && ` · ${run.skewed} from a clock running ahead`} · {run.ms} ms
                </span>
                {run.error && <span className="break-words text-text-dim">{run.error}</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  )
}
