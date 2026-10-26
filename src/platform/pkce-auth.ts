import { DRIVE_SCOPE } from './google-auth'
import type { SyncAuth, SyncAuthState } from './types'

// Sign-in for sync in an installed app (docs/architecture/sync.md, section
// 3): OAuth 2.0 with PKCE in the system browser, redirected back to a
// loopback address this app listens on, as Google asks of desktop apps. It
// gets a refresh token, kept in the system's keychain, so the app stays
// connected across restarts and renews its access token without asking.
// What needs the shell (listening, opening the browser, reaching Google's
// token endpoint, the keychain) is passed in as `PkceNative`.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const REFRESH_KEY = 'google-refresh-token'
const EXPIRY_MARGIN_MS = 60_000

export interface PkceNative {
  /** Listen on a free loopback port for the browser to come back to. */
  listen(): Promise<{ port: number; callback: () => Promise<string> }>
  openBrowser(url: string): Promise<void>
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

export interface PkceAuthOptions {
  clientId: string
  /** Google's "Desktop app" clients need theirs sent; it isn't confidential
   * for an installed app (Google's own words), so it is built in. */
  clientSecret?: string
  native: PkceNative
  now?: () => number
  randomBytes?: (count: number) => Uint8Array
}

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/** A PKCE verifier and its S256 challenge (RFC 7636). */
export async function pkcePair(randomBytes: (count: number) => Uint8Array) {
  const verifier = base64Url(randomBytes(32))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64Url(new Uint8Array(digest)) }
}

interface TokenBody {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  error?: string
  error_description?: string
}

export function createPkceAuth({
  clientId,
  clientSecret,
  native,
  now = Date.now,
  randomBytes = (count) => crypto.getRandomValues(new Uint8Array(count)),
}: PkceAuthOptions): SyncAuth {
  const listeners = new Set<() => void>()
  let state: SyncAuthState = 'signed-out'
  let access: { value: string; expiresAt: number } | null = null
  let refresh: string | null = null

  function setState(next: SyncAuthState) {
    if (next === state) return
    state = next
    listeners.forEach((listener) => listener())
  }

  // A refresh token kept from last time means still connected. Read only
  // once something subscribes (the sync store, with sync on): reading the
  // keychain can make the system ask to unlock it.
  let loaded: Promise<void> | null = null
  const load = () =>
    (loaded ??= Promise.resolve()
      .then(() => native.secrets.get(REFRESH_KEY))
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
    const { body } = await native.post('token', { ...credentials(), ...form })
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
        await native.secrets.delete(REFRESH_KEY).catch(() => {})
      }
      access = null
      setState('needs-reconnect')
      return null
    }
    keep(body)
    return access!.value
  }

  return {
    state: () => state,
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
      const before = state
      setState('signing-in')
      try {
        const { verifier, challenge } = await pkcePair(randomBytes)
        const expected = base64Url(randomBytes(16))
        const { port, callback } = await native.listen()
        const redirect = `http://127.0.0.1:${port}`
        const url = new URL(AUTH_URL)
        url.search = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirect,
          response_type: 'code',
          scope: DRIVE_SCOPE,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state: expected,
          // A refresh token, every time: an earlier one may have been lost.
          access_type: 'offline',
          prompt: 'consent',
        }).toString()
        await native.openBrowser(url.toString())

        const query = new URLSearchParams(await callback())
        if (query.get('state') !== expected)
          throw new Error('Sign-in came back for another request.')
        const error = query.get('error')
        if (error === 'access_denied') throw new Error('Google Drive access wasn’t allowed.')
        if (error) throw new Error(`Google sign-in failed (${error}).`)
        const body = await tokenRequest({
          grant_type: 'authorization_code',
          code: query.get('code') ?? '',
          code_verifier: verifier,
          redirect_uri: redirect,
        })
        if (!body.access_token) {
          throw new Error(body.error_description ?? `Google sign-in failed (${body.error}).`)
        }
        if (!body.scope?.split(' ').includes(DRIVE_SCOPE)) {
          throw new Error('Google Drive access wasn’t allowed, so there is nowhere to sync to.')
        }
        keep(body)
        if (body.refresh_token) {
          refresh = body.refresh_token
          // Without a keychain the app still syncs; it just asks again next launch.
          await native.secrets.set(REFRESH_KEY, refresh).catch(() => {})
        }
        setState('signed-in')
      } catch (err) {
        setState(before === 'signing-in' ? 'signed-out' : before)
        throw err
      }
    },

    async signOut() {
      const token = refresh ?? access?.value
      access = null
      refresh = null
      await native.secrets.delete(REFRESH_KEY).catch(() => {})
      setState('signed-out')
      // Revoking is a courtesy; the keychain entry is already gone.
      if (token) await native.post('revoke', { token }).catch(() => {})
    },
  }
}
