import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSignInAttempts,
  SIGN_IN_TIMEOUT_MS,
  SignInTimeoutError,
} from '@/platform/sign-in-attempts'
import type { SyncAuthState } from '@/platform/types'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** A host whose state the test reads, and an attempt the test finishes. */
function setup(initial: SyncAuthState = 'signed-out') {
  let state = initial
  const host = { state: () => state, setState: (next: SyncAuthState) => void (state = next) }
  const attempts = createSignInAttempts(host)
  /** An attempt that signs in when the test calls `finish`, if still current. */
  function pending() {
    let finish!: () => void
    let fail!: (error: Error) => void
    const flow = (isCurrent: () => boolean) =>
      new Promise<void>((resolve, reject) => {
        finish = () => {
          if (isCurrent()) host.setState('signed-in')
          resolve()
        }
        fail = reject
      })
    return { flow, finish: () => finish(), fail: (e: Error) => fail(e) }
  }
  return { attempts, pending, state: () => state }
}

describe('sign-in attempts', () => {
  it('gives the button back after 20 seconds without an answer', async () => {
    const { attempts, pending, state } = setup()
    const result = attempts.run(pending().flow)
    expect(state()).toBe('signing-in')
    await vi.advanceTimersByTimeAsync(SIGN_IN_TIMEOUT_MS - 1)
    expect(state()).toBe('signing-in')
    const failed = expect(result).rejects.toBeInstanceOf(SignInTimeoutError)
    await vi.advanceTimersByTimeAsync(1)
    await failed
    expect(state()).toBe('signed-out')
  })

  it('goes back to where it was, not always to signed out', async () => {
    const { attempts, pending, state } = setup('needs-reconnect')
    const one = pending()
    const result = attempts.run(one.flow)
    one.fail(new Error('closed'))
    await expect(result).rejects.toThrow('closed')
    expect(state()).toBe('needs-reconnect')
  })

  it('pressing again abandons the last attempt: its answer changes nothing', async () => {
    const { attempts, pending, state } = setup()
    const first = pending()
    const firstResult = attempts.run(first.flow)
    await vi.advanceTimersByTimeAsync(5000)
    const second = pending()
    const secondResult = attempts.run(second.flow)

    first.finish() // the first browser tab comes back late
    await firstResult // quietly: its caller has moved on
    expect(state()).toBe('signing-in')

    second.finish()
    await secondResult
    expect(state()).toBe('signed-in')
  })

  it('an abandoned attempt’s failure or timeout doesn’t speak over the new one', async () => {
    const { attempts, pending, state } = setup()
    const first = pending()
    const firstResult = attempts.run(first.flow)
    const second = pending()
    const secondResult = attempts.run(second.flow)
    first.fail(new Error('old window closed'))
    await expect(firstResult).resolves.toBeUndefined()
    expect(state()).toBe('signing-in')
    const timedOut = expect(secondResult).rejects.toBeInstanceOf(SignInTimeoutError)
    await vi.advanceTimersByTimeAsync(SIGN_IN_TIMEOUT_MS)
    await timedOut
    expect(state()).toBe('signed-out')
  })

  it('still signs in if the newest attempt finishes after the wait', async () => {
    const { attempts, pending, state } = setup()
    const slow = pending()
    const result = attempts.run(slow.flow)
    const failed = expect(result).rejects.toBeInstanceOf(SignInTimeoutError)
    await vi.advanceTimersByTimeAsync(SIGN_IN_TIMEOUT_MS)
    await failed
    expect(state()).toBe('signed-out')
    slow.finish() // the password and second step took a minute
    await vi.advanceTimersByTimeAsync(0)
    expect(state()).toBe('signed-in')
  })

  it('ignores whatever an attempt brings back after signing out', async () => {
    const { attempts, pending, state } = setup()
    const one = pending()
    void attempts.run(one.flow)
    attempts.abandon()
    one.finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(state()).not.toBe('signed-in')
  })
})
