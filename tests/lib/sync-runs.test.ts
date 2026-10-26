import { beforeEach, describe, expect, it } from 'vitest'
import type { SyncRun } from '@/core/sync/run'
import {
  addSyncRun,
  clearSyncLog,
  deviceName,
  formatSyncLog,
  MAX_RUNS,
  readSeenDevices,
  readSyncRuns,
  saveSeenDevices,
} from '@/lib/sync-runs'

const run = (at: number, extra: Partial<SyncRun> = {}): SyncRun => ({
  at,
  ms: 120,
  outcome: 'synced',
  sent: 1,
  received: 2,
  skewed: 0,
  ...extra,
})

beforeEach(() => localStorage.clear())

describe('the sync log', () => {
  it('keeps the newest runs only', () => {
    for (let i = 0; i < MAX_RUNS + 5; i++) addSyncRun(run(i))
    const runs = readSyncRuns()
    expect(runs).toHaveLength(MAX_RUNS)
    expect(runs[0]!.at).toBe(5)
  })

  it('is forgotten on disconnect', () => {
    addSyncRun(run(1))
    saveSeenDevices([{ device: 'd', lastSeen: 1 }])
    clearSyncLog()
    expect(readSyncRuns()).toEqual([])
    expect(readSeenDevices()).toEqual([])
  })

  it('reads as text for a bug report, newest run first', () => {
    const text = formatSyncLog(
      'me',
      [{ device: 'other', name: 'Chrome on Android', lastSeen: 0 }],
      [run(0), run(1000, { outcome: 'offline', error: 'Google Drive couldn’t be reached.' })],
      '1.2.3',
    )
    expect(text).toContain('This device: me')
    expect(text).toContain('other  Chrome on Android  last seen 1970-01-01T00:00:00.000Z')
    expect(text.indexOf('offline')).toBeLessThan(text.indexOf('synced'))
    expect(text).toContain('sent 1  received 2  skewed 0')
    expect(text).toContain('Google Drive couldn’t be reached.')
  })

  it('names a device from its browser', () => {
    expect(
      deviceName(
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome on Android')
    expect(
      deviceName('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'),
    ).toBe('Firefox on Linux')
    expect(
      deviceName(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari on iOS')
    expect(deviceName('')).toBe('A browser')
  })
})
