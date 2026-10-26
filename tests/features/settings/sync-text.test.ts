import { describe, expect, it } from 'vitest'
import {
  bookFilesText,
  connectLabel,
  syncedTime,
  syncStatusText,
} from '@/features/settings/sync-text'

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

  it('says what happens to book files, and how much room is left', () => {
    const usage = { used: 12 * 1024 * 1024, free: 15 * 1024 ** 3 }
    expect(bookFilesText(true, null, usage, null)).toBe(
      'Your books are copied to Drive, so your other devices can download them. On Drive: 12 MB · 15.0 GB free.',
    )
    expect(bookFilesText(true, { done: 1, total: 3 }, usage, null)).toBe(
      'Uploading books: 1 of 3 done.',
    )
    expect(bookFilesText(false, null, null, null)).toMatch(/^Paused\./)
    expect(bookFilesText(true, null, { used: 2048, free: null }, null)).toMatch(/On Drive: 2 KB\.$/)
    expect(bookFilesText(true, null, usage, 'Google Drive is full.')).toBe(
      'Couldn’t sync book files: Google Drive is full.',
    )
  })
})
