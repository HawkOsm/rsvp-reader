// The sync log (docs/architecture/sync.md, decision 15): recent sync runs and
// the other devices last seen, kept on this device for Settings → Sync log
// and bug reports. In localStorage, like the error log, so it can still be
// read when the database is what's broken.

import type { DeviceInfo, SyncRun } from '@/core/sync/run'

const RUNS_KEY = 'rsvp-reader:sync-runs'
const DEVICES_KEY = 'rsvp-reader:sync-devices'
/** The newest are kept. */
export const MAX_RUNS = 50

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function readList<T>(key: string): T[] {
  try {
    const saved = JSON.parse(storage()?.getItem(key) ?? '[]') as unknown
    return Array.isArray(saved) ? (saved as T[]) : []
  } catch {
    return [] // unreadable: start the log again
  }
}

function writeList(key: string, list: unknown[]): void {
  try {
    storage()?.setItem(key, JSON.stringify(list))
  } catch {
    // Storage full or refused: the log is a convenience, sync goes on.
  }
}

/** Runs, oldest first. */
export const readSyncRuns = () => readList<SyncRun>(RUNS_KEY)

export function addSyncRun(run: SyncRun): void {
  writeList(RUNS_KEY, [...readSyncRuns(), run].slice(-MAX_RUNS))
}

export const readSeenDevices = () => readList<DeviceInfo>(DEVICES_KEY)

export function saveSeenDevices(devices: DeviceInfo[]): void {
  writeList(DEVICES_KEY, devices)
}

/** Forget runs and devices, on disconnecting. */
export function clearSyncLog(): void {
  try {
    storage()?.removeItem(RUNS_KEY)
    storage()?.removeItem(DEVICES_KEY)
  } catch {
    // Nothing to clear.
  }
}

/** A name for this device that other devices can show, from the browser's
 * user agent: "Firefox on Android". */
export function deviceName(userAgent: string): string {
  const browser =
    [
      [/Edg\//, 'Edge'],
      [/Firefox\//, 'Firefox'],
      [/OPR\//, 'Opera'],
      [/Chrome\//, 'Chrome'],
      [/Safari\//, 'Safari'],
    ].find(([pattern]) => (pattern as RegExp).test(userAgent))?.[1] ?? 'A browser'
  const system =
    [
      [/Android/, 'Android'],
      [/iPhone|iPad/, 'iOS'],
      [/Windows/, 'Windows'],
      [/Mac OS X|Macintosh/, 'macOS'],
      [/CrOS/, 'ChromeOS'],
      [/Linux/, 'Linux'],
    ].find(([pattern]) => (pattern as RegExp).test(userAgent))?.[1] ?? null
  return system ? `${browser} on ${system}` : String(browser)
}

/** The log as plain text, newest run first, to copy into a bug report. */
export function formatSyncLog(
  thisDevice: string,
  devices: DeviceInfo[],
  runs: SyncRun[],
  version: string,
): string {
  const time = (at: number) => new Date(at).toISOString()
  return [
    `RSVP Reader ${version}, sync log`,
    `This device: ${thisDevice}`,
    '',
    'Other devices:',
    ...(devices.length === 0
      ? ['  none yet']
      : devices.map((d) => `  ${d.device}  ${d.name ?? 'unnamed'}  last seen ${time(d.lastSeen)}`)),
    '',
    'Runs, newest first:',
    ...[...runs]
      .reverse()
      .map(
        (r) =>
          `  ${time(r.at)}  ${r.outcome}  sent ${r.sent}  received ${r.received}  skewed ${r.skewed}  ${r.ms} ms` +
          (r.error ? `\n    ${r.error}` : ''),
      ),
  ].join('\n')
}
