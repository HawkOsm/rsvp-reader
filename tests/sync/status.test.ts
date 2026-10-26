import { describe, expect, it } from 'vitest'
import { SyncFormatError, type SyncResult } from '@/sync/coordinator'
import { DriveError, DriveFullError, NeedsReconnectError, OfflineError } from '@/sync/drive'
import { isExpected, outcomeOf, phaseOf, runRecord } from '@/sync/status'

const result: SyncResult = {
  applied: 2,
  pushed: 3,
  skewed: 1,
  settingsChanged: false,
  libraryChanged: false,
  devices: [],
}

describe('sync status', () => {
  it('sorts failures into what the user can do about them', () => {
    expect(outcomeOf(new NeedsReconnectError())).toBe('needs-reconnect')
    expect(outcomeOf(new OfflineError())).toBe('offline')
    expect(outcomeOf(new DriveFullError())).toBe('drive-full')
    expect(outcomeOf(new DriveError(500, 'x'))).toBe('error')
    expect(outcomeOf(new SyncFormatError(2))).toBe('error')
    expect(isExpected('offline')).toBe(true)
    expect(isExpected('drive-full')).toBe(false)
  })

  it('records a run', () => {
    expect(runRecord(10, 5, result)).toEqual({
      at: 10,
      ms: 5,
      outcome: 'synced',
      sent: 3,
      received: 2,
      skewed: 1,
    })
    expect(runRecord(10, 5, null, new OfflineError())).toMatchObject({
      outcome: 'offline',
      sent: 0,
      error: 'Google Drive couldn’t be reached.',
    })
  })

  it('says where sync stands', () => {
    expect(phaseOf(null, false, null)).toBe('unavailable')
    expect(phaseOf('signed-out', false, 'synced')).toBe('off')
    expect(phaseOf('signing-in', false, null)).toBe('connecting')
    expect(phaseOf('needs-reconnect', false, 'synced')).toBe('needs-reconnect')
    expect(phaseOf('signed-in', false, null)).toBe('syncing')
    expect(phaseOf('signed-in', true, 'synced')).toBe('syncing')
    expect(phaseOf('signed-in', false, 'drive-full')).toBe('drive-full')
  })
})
