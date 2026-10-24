import { describe, expect, it, vi } from 'vitest'
import { createFlags } from '@/lib/flags'

const REGISTRY = { sync: { description: 'Sync' }, notes: { description: 'Notes' } }

function memoryStorage(initial?: string) {
  const data = new Map<string, string>(initial ? [['rsvp-reader:flags', initial]] : [])
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

describe('feature flags', () => {
  it('are all off by default', () => {
    const flags = createFlags(REGISTRY, memoryStorage())
    expect(flags.isEnabled('sync')).toBe(false)
    expect(flags.isEnabled('notes')).toBe(false)
  })

  it('switch on and off, persist, and tell subscribers', () => {
    const storage = memoryStorage()
    const flags = createFlags(REGISTRY, storage)
    const listener = vi.fn()
    flags.subscribe(listener)
    flags.setEnabled('sync', true)
    expect(flags.isEnabled('sync')).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(flags.snapshot()).toEqual(new Set(['sync']))
    expect(createFlags(REGISTRY, storage).isEnabled('sync')).toBe(true) // after a reload
    flags.setEnabled('sync', false)
    expect(createFlags(REGISTRY, storage).isEnabled('sync')).toBe(false)
  })

  it('forget flags that no longer exist, and survive garbage in storage', () => {
    expect(createFlags(REGISTRY, memoryStorage('["sync","removed"]')).isEnabled('sync')).toBe(true)
    expect(createFlags(REGISTRY, memoryStorage('not json')).isEnabled('sync')).toBe(false)
    expect(createFlags(REGISTRY, null).isEnabled('sync')).toBe(false)
  })
})
