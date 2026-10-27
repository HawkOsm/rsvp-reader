import type { SyncAuthState } from './types'

// How a sign-in is run, the same in every shell. Pressing Connect again
// starts a new attempt and abandons the one before: whatever it brings back
// later is ignored. An attempt that hasn't finished after a while gives the
// Connect button back, so a sign-in window that never reports back (closed,
// blocked, or a browser tab left open) can't leave it stuck. If that newest
// attempt does finish later, it still signs in: typing a password and a
// second-step code can take longer than the wait.

export const SIGN_IN_TIMEOUT_MS = 20_000

export class SignInTimeoutError extends Error {
  constructor() {
    super(
      'Sign-in hasn’t finished. If you’re still signing in to Google, the app connects when you’re done; otherwise, press Connect again.',
    )
    this.name = 'SignInTimeoutError'
  }
}

export interface SignInHost {
  state(): SyncAuthState
  setState(next: SyncAuthState): void
  /** Something changed without the state changing: a failure came in. */
  notify(): void
}

/** `flow` is one attempt. It must keep what it gets (a token, the signed-in
 * state) only while `isCurrent()` is true. */
export type SignInFlow = (isCurrent: () => boolean) => Promise<void>

export function createSignInAttempts(host: SignInHost, timeoutMs = SIGN_IN_TIMEOUT_MS) {
  let newest = 0
  /** Where the state goes back to: what it was before the first attempt. */
  let resting: SyncAuthState = 'signed-out'
  /** Why the newest attempt failed, if it did. Kept apart from the caller's
   * rejection, which nobody hears once the wait is up: a failure after
   * that would otherwise be lost. */
  let failure: string | null = null

  function fail(error: unknown) {
    failure = error instanceof Error ? error.message : String(error)
    host.notify()
  }

  /** Run an attempt. Settles as `flow` does, or rejects with
   * `SignInTimeoutError` after `timeoutMs` while `flow` carries on. Once
   * abandoned, it settles quietly. */
  function run(flow: SignInFlow): Promise<void> {
    const attempt = ++newest
    const isCurrent = () => attempt === newest
    failure = null
    if (host.state() !== 'signing-in') resting = host.state()
    host.setState('signing-in')
    const giveBack = () => {
      if (isCurrent() && host.state() === 'signing-in') host.setState(resting)
    }

    // A failure goes back to where sign-in started. An attempt that was
    // abandoned reports nothing: its caller has moved on.
    const outcome = flow(isCurrent).catch((error: unknown) => {
      giveBack()
      if (!isCurrent()) return
      fail(error)
      throw error
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    const waited = new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => {
        if (!isCurrent()) return resolve()
        giveBack()
        const error = new SignInTimeoutError()
        fail(error)
        reject(error)
      }, timeoutMs)
    })
    return Promise.race([outcome, waited]).finally(() => clearTimeout(timer))
  }

  return {
    run,
    /** Why the newest attempt failed: after the wait too, unlike `run`'s
     * rejection. `null` while it is running, or once it signed in. */
    failure: () => failure,
    /** Drop every attempt still out (on signing out): whatever they bring
     * back is ignored. */
    abandon() {
      newest++
    },
  }
}
