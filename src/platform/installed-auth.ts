import { DRIVE_SCOPE } from './google-auth'
import { createSignInAttempts } from './sign-in-attempts'
import type { SyncAuth, SyncAuthState } from './types'

// Sign-in for sync in an installed app (docs/architecture/sync.md, section
// 3), whichever way the user is asked: what is the same is here. It keeps a
// refresh token in the shell's store, so the app stays connected across
// restarts and renews its access token without asking. How the user signs in
// (`Authorize`) and what needs the shell (`InstalledAuthBackend`) are passed
// in.

const REFRESH_KEY = 'google-refresh-token'
const EXPIRY_MARGIN_MS = 60_000

export interface InstalledAuthBackend {
  /** POST a form to Google's token endpoint (`revoke` for its revoke one). */
  post(
    endpoint: 'token' | 'revoke',
    form: Record<string, string>,
  ): Promise<{ status: number; body: string }>
  secrets: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    delete(key: string): Promise<void>
  }
}

export interface TokenBody {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  error?: string
  error_description?: string
}

/** What one sign-in attempt is given to work with. */
export interface SignInStep {
  /** False once Connect was pressed again, or the user signed out: stop. */
  isCurrent(): boolean
  /** POST to the token endpoint, with the client's credentials added. */
  tokenRequest(form: Record<string, string>): Promise<TokenBody>
  /** Show the user where to sign in, while this attempt waits for them. */
  show(prompt: { link: string; code?: string }): void
}

/** One way of asking the user to sign in. Resolves with Google's token
 * answer, or `null` if the attempt was abandoned meanwhile. */
export type Authorize = (step: SignInStep) => Promise<TokenBody | null>

export interface InstalledAuthOptions {
  clientId: string
  /** Google's installed-app clients need theirs sent; it isn't confidential
   * for an installed app (Google's own words), so it is built in. */
  clientSecret?: string
  backend: InstalledAuthBackend
  authorize: Authorize
  now?: () => number
  /** How long Connect waits before giving the button back. */
  signInTimeoutMs?: number
}

export function createInstalledAuth({
  clientId,
  clientSecret,
  backend,
  authorize,
  now = Date.now,
  signInTimeoutMs,
}: InstalledAuthOptions): SyncAuth {
  const listeners = new Set<() => void>()
  let state: SyncAuthState = 'signed-out'
  let access: { value: string; expiresAt: number } | null = null
  let refresh: string | null = null
  /** Where the current attempt sends the user, while it waits for them. */
  let prompt: { link: string; code?: string } | null = null
  const notify = () => listeners.forEach((listener) => listener())

  function setState(next: SyncAuthState) {
    if (next === state) return
    state = next
    listeners.forEach((listener) => listener())
  }

  const attempts = createSignInAttempts({ state: () => state, setState, notify }, signInTimeoutMs)

  // A refresh token kept from last time means still connected. Read only
  // once something subscribes (the sync store, with sync on): reading the
  // keychain can make the system ask to unlock it.
  let loaded: Promise<void> | null = null
  const load = () =>
    (loaded ??= Promise.resolve()
      .then(() => backend.secrets.get(REFRESH_KEY))
      .then((saved) => {
        refresh = saved
        if (saved && state === 'signed-out') setState('signed-in')
      })
      .catch(() => {
        // No keychain (a Linux session without one): connect each launch.
      }))

  const credentials = () => ({
    client_id: clientId,
    ...(clientSecret && { client_secret: clientSecret }),
  })

  async function tokenRequest(form: Record<string, string>): Promise<TokenBody> {
    const { body } = await backend.post('token', { ...credentials(), ...form })
    try {
      return JSON.parse(body) as TokenBody
    } catch {
      return { error: 'bad_response', error_description: body.slice(0, 200) }
    }
  }

  function keep(body: TokenBody) {
    access = {
      value: body.access_token as string,
      expiresAt: now() + (body.expires_in ?? 3600) * 1000,
    }
  }

  /** A new access token from the refresh token, or `null` if Google no
   * longer accepts it (revoked, or expired in Testing mode). */
  async function renew(): Promise<string | null> {
    await load()
    if (!refresh) return null
    const body = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh })
    if (!body.access_token) {
      if (body.error === 'invalid_grant') {
        refresh = null
        // Already gone, or no keychain: either way it isn't kept.
        await backend.secrets.delete(REFRESH_KEY).catch(() => {})
      }
      access = null
      setState('needs-reconnect')
      return null
    }
    keep(body)
    return access!.value
  }

  /** One sign-in. It keeps what it gets only while it is the current
   * attempt. */
  async function signInFlow(isCurrent: () => boolean): Promise<void> {
    const body = await authorize({
      isCurrent,
      tokenRequest,
      show(shown) {
        if (!isCurrent()) return
        prompt = shown
        notify()
      },
    })
    if (!body) return
    if (!body.access_token) {
      throw new Error(body.error_description ?? `Google sign-in failed (${body.error}).`)
    }
    if (!body.scope?.split(' ').includes(DRIVE_SCOPE)) {
      throw new Error('Google Drive access wasn’t allowed, so there is nowhere to sync to.')
    }
    if (!isCurrent()) return
    keep(body)
    if (body.refresh_token) {
      refresh = body.refresh_token
      // Without a keychain the app still syncs; it just asks again next launch.
      await backend.secrets.set(REFRESH_KEY, refresh).catch(() => {})
    }
    setState('signed-in')
  }

  return {
    state: () => state,
    signInError: () => attempts.failure(),
    signInLink: () => prompt?.link ?? null,
    signInCode: () => prompt?.code ?? null,
    subscribe(listener) {
      listeners.add(listener)
      void load()
      return () => void listeners.delete(listener)
    },

    async getToken() {
      await load()
      if (state !== 'signed-in') return null
      if (access && now() < access.expiresAt - EXPIRY_MARGIN_MS) return access.value
      return renew()
    },

    async renewToken() {
      access = null
      return state === 'signed-in' ? renew() : null
    },

    async signIn() {
      if (!clientId) {
        throw new Error('This build has no Google client ID, so it can’t connect to Drive.')
      }
      return attempts.run(async (isCurrent) => {
        try {
          await signInFlow(isCurrent)
        } finally {
          // Used, refused or abandoned: the link no longer leads anywhere.
          if (isCurrent() && prompt !== null) {
            prompt = null
            notify()
          }
        }
      })
    },

    async signOut() {
      attempts.abandon()
      prompt = null
      const token = refresh ?? access?.value
      access = null
      refresh = null
      await backend.secrets.delete(REFRESH_KEY).catch(() => {})
      setState('signed-out')
      // Revoking is a courtesy; the keychain entry is already gone.
      if (token) await backend.post('revoke', { token }).catch(() => {})
    },
  }
}
