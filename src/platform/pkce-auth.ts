import { DRIVE_SCOPE } from './google-auth'
import { createInstalledAuth, type InstalledAuthBackend } from './installed-auth'
import type { SyncAuth } from './types'

// Sign-in for sync on the desktop (docs/architecture/sync.md, section 3):
// OAuth 2.0 with PKCE in the system browser, redirected back to a loopback
// address this app listens on, as Google asks of desktop apps. Keeping and
// renewing the tokens is `installed-auth.ts`. What needs the shell
// (listening, opening the browser, reaching Google's token endpoint, the
// keychain) is passed in as `PkceNative`.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

export interface PkceNative extends InstalledAuthBackend {
  /** Listen on a free loopback port for the browser to come back to. */
  listen(): Promise<{ port: number; callback: () => Promise<string> }>
  openBrowser(url: string): Promise<void>
}

export interface PkceAuthOptions {
  clientId: string
  /** Google's "Desktop app" clients need theirs sent; it isn't confidential
   * for an installed app (Google's own words), so it is built in. */
  clientSecret?: string
  native: PkceNative
  now?: () => number
  randomBytes?: (count: number) => Uint8Array
  /** How long Connect waits before giving the button back. */
  signInTimeoutMs?: number
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

export function createPkceAuth({
  clientId,
  clientSecret,
  native,
  now,
  randomBytes = (count) => crypto.getRandomValues(new Uint8Array(count)),
  signInTimeoutMs,
}: PkceAuthOptions): SyncAuth {
  return createInstalledAuth({
    clientId,
    clientSecret,
    backend: native,
    now,
    signInTimeoutMs,
    /** One sign-in through the browser. */
    async authorize(step) {
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
      step.show({ link: url.toString() })
      await native.openBrowser(url.toString())

      const query = new URLSearchParams(await callback())
      // Connect was pressed again since: this answer is for nobody.
      if (!step.isCurrent()) return null
      if (query.get('state') !== expected) throw new Error('Sign-in came back for another request.')
      const error = query.get('error')
      if (error === 'access_denied') throw new Error('Google Drive access wasn’t allowed.')
      if (error) throw new Error(`Google sign-in failed (${error}).`)
      return step.tokenRequest({
        grant_type: 'authorization_code',
        code: query.get('code') ?? '',
        code_verifier: verifier,
        redirect_uri: redirect,
      })
    },
  })
}
