import { describe, expect, it } from 'vitest'

// Placeholder so `pnpm test` has something to run before Phase 1 adds the
// real parity tests in tests/parity/. Delete once those land.
describe('toolchain sanity', () => {
  it('runs in jsdom', () => {
    expect(typeof document).toBe('object')
  })
})
