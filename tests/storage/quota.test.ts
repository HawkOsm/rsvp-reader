import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestPersistence, storageUsage } from '../../src/storage/quota'

const originalStorage = navigator.storage

afterEach(() => {
  Object.defineProperty(navigator, 'storage', { value: originalStorage, configurable: true })
})

describe('requestPersistence', () => {
  it('returns false when navigator.storage.persist is unavailable', async () => {
    Object.defineProperty(navigator, 'storage', { value: {}, configurable: true })
    expect(await requestPersistence()).toBe(false)
  })

  it('returns whatever the browser grants', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: { persist: vi.fn().mockResolvedValue(true) },
      configurable: true,
    })
    expect(await requestPersistence()).toBe(true)
  })
})

describe('storageUsage', () => {
  it('returns null when navigator.storage.estimate is unavailable', async () => {
    Object.defineProperty(navigator, 'storage', { value: {}, configurable: true })
    expect(await storageUsage()).toBeNull()
  })

  it('maps usage/quota to bytes', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: vi.fn().mockResolvedValue({ usage: 1024, quota: 4096 }) },
      configurable: true,
    })
    expect(await storageUsage()).toEqual({ usageBytes: 1024, quotaBytes: 4096 })
  })
})
