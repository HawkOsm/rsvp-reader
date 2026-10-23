import { describe, expect, it } from 'vitest'
import { SettingsService } from '@/lib/settings-service'
import { DexieRepository } from '@/storage/repository'
import { getDb } from '@/storage/schema'

describe('SettingsService', () => {
  it('fills unsaved keys from the defaults', async () => {
    const settings = new SettingsService(new DexieRepository(getDb(`test-${Math.random()}`)))
    await settings.save('fontSize', 72)
    expect(await settings.load({ fontSize: 56, theme: 'system' })).toEqual({
      fontSize: 72,
      theme: 'system',
    })
  })
})
