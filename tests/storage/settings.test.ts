import { beforeEach, describe, expect, it } from 'vitest'
import { getSetting, setSetting } from '../../src/storage/settings'
import { getDb, type RsvpDatabase } from '../../src/storage/schema'

let db: RsvpDatabase

beforeEach(() => {
  db = getDb(`test-${Math.random().toString(36).slice(2)}`)
})

describe('settings', () => {
  it('returns the fallback when unset', async () => {
    expect(await getSetting(db, 'wpm', 300)).toBe(300)
  })

  it('round-trips a value, including non-primitive ones', async () => {
    await setSetting(db, 'wpm', 450)
    expect(await getSetting(db, 'wpm', 0)).toBe(450)

    await setSetting(db, 'panel', { open: true, widthPx: 320 })
    expect(await getSetting(db, 'panel', null)).toEqual({ open: true, widthPx: 320 })
  })

  it('overwrites an existing value', async () => {
    await setSetting(db, 'theme', 'dark')
    await setSetting(db, 'theme', 'light')
    expect(await getSetting(db, 'theme', 'dark')).toBe('light')
  })
})
