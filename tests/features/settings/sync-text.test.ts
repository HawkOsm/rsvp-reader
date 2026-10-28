import { describe, expect, it } from 'vitest'
import { connectLabel, syncedTime, syncStatusText } from '@/features/settings/sync-text'

const now = new Date(2026, 9, 26, 15, 0).getTime()
const today = new Date(2026, 9, 26, 14, 5).getTime()
const earlier = new Date(2026, 9, 3, 9, 30).getTime()

describe('what Settings says about sync', () => {
  it('gives the time alone for today, and the date too for another day', () => {
    expect(syncedTime(today, now)).toMatch(/14:05|2:05/)
    expect(syncedTime(earlier, now)).toMatch(/3/)
    expect(syncedTime(earlier, now)).toMatch(/Oct/)
  })

  it('says where sync stands, and what to do about it', () => {
    expect(syncStatusText('off', null, null, null, now)).toBe('Not connected.')
    expect(syncStatusText('off', null, null, 'The sign-in window was closed.', now)).toBe(
      'The sign-in window was closed.',
    )
    expect(syncStatusText('synced', today, null, null, now)).toMatch(/^Synced at .*:05.*\.$/)
    expect(
      syncStatusText('needs-reconnect', today, 'Google Drive needs reconnecting.', null, now),
    ).toMatch(/^Paused until you reconnect\. Reading carries on as normal\. Last synced/)
    expect(syncStatusText('offline', null, null, null, now)).toBe(
      'Offline. Changes go out when you’re back online.',
    )
    expect(syncStatusText('drive-full', null, null, null, now)).toMatch(/Drive is full/)
    expect(syncStatusText('error', null, 'Google Drive: 500 x', null, now)).toBe(
      'Sync failed: Google Drive: 500 x.',
    )
  })

  it('offers to connect, reconnect or disconnect', () => {
    expect(connectLabel('unavailable')).toBeNull()
    expect(connectLabel('off')).toBe('Connect Google Drive')
    expect(connectLabel('needs-reconnect')).toBe('Reconnect')
    expect(connectLabel('synced')).toBe('Disconnect')
    expect(connectLabel('drive-full')).toBe('Disconnect')
  })
})
