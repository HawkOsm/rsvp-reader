import { createSignInAttempts } from './sign-in-attempts'
import type { SyncAuth, SyncAuthState } from './types'

// Sign-in for sync in the browser: Google Identity Services' token flow
// (docs/architecture/sync.md, section 3). It gives an access token for about
// an hour and no refresh token, and a new one needs a click, so an expired
// token puts sync into "needs reconnect" rather than interrupting anything.
// The token is kept in memory only. What is remembered is that the user
// connected, so a reopened app says "Reconnect" rather than "Connect".

/** Drive's hidden per-app folder, and nothing else of the user's. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'

const GIS_URL = 'https://accounts.google.com/gsi/client'
const CONNECTED_KEY = 'rsvp-reader:sync-connected'
/** A token this close to expiring is treated as expired, so it can't run out
 * halfway through a sync. */
const EXPIRY_MARGIN_MS = 60_000

/** The part of Google Identity Services this uses. */
export interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback?: (error: { type: string }) => void
  }): { requestAccessToken(options?: { prompt?: string }): void }
  hasGrantedAllScopes(response: TokenResponse, scope: string): boolean
  revoke(token: string, done?: () => void): void
}

export interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
  error_description?: string
}

export interface GoogleAuthOptions {
  clientId: string
  /** Loads Google's script; called on the first sign-in, never before. */
  loadGis: () => Promise<GoogleOAuth2>
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  now?: () => number
  /** How long Connect waits before giving the button back. */
  signInTimeoutMs?: number
}

/** What to tell the user when sign-in didn't finish. */
export function signInFailure(type: string): string {
  switch (type) {
    case 'popup_failed_to_open':
      return 'The browser blocked Google’s sign-in window. Allow pop-ups for this site, or press Connect again.'
    case 'popup_closed':
      return 'The sign-in window was closed before it finished.'
    default:
      return `Google sign-in failed (${type}).`
  }
}

export function createGoogleAuth({
  clientId,
  loadGis,
  storage,
  now = Date.now,
  signInTimeoutMs,
}: GoogleAuthOptions): SyncAuth {
  const listeners = new Set<() => void>()
  let token: { value: string; expiresAt: number } | null = null
  let state: SyncAuthState = connected() ? 'needs-reconnect' : 'signed-out'
  let gis: GoogleOAuth2 | null = null

  function connected(): boolean {
    try {
      return storage?.getItem(CONNECTED_KEY) === '1'
    } catch {
      return false // storage refused: the user presses Connect, not Reconnect
    }
  }

  function remember(on: boolean) {
    try {
      if (on) storage?.setItem(CONNECTED_KEY, '1')
      else storage?.removeItem(CONNECTED_KEY)
    } catch {
      // Storage refused (private mode): the next visit asks to connect afresh.
    }
  }

  function setState(next: SyncAuthState) {
    if (next === state) return
    state = next
    listeners.forEach((listener) => listener())
  }

  const attempts = createSignInAttempts({ state: () => state, setState }, signInTimeoutMs)

  /** The token is gone; the user has to sign in again to sync. */
  function lose() {
    token = null
    if (state === 'signed-in') setState('needs-reconnect')
  }

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },

    async getToken() {
      if (token && now() < token.expiresAt - EXPIRY_MARGIN_MS) return token.value
      lose()
      return null
    },

    // The browser flow has no refresh token, and asking for a new access
    // token opens a window, which only a click may do.
    async renewToken() {
      lose()
      return null
    },

    async signIn() {
      if (!clientId) {
        throw new Error('This build has no Google client ID, so it can’t connect to Drive.')
      }
      return attempts.run(async (isCurrent) => {
        gis ??= await loadGis()
        const client = gis
        const response = await new Promise<TokenResponse>((resolve, reject) => {
          client
            .initTokenClient({
              client_id: clientId,
              scope: DRIVE_SCOPE,
              callback: resolve,
              error_callback: (error) => reject(new Error(signInFailure(error.type))),
            })
            // Asks for consent the first time only.
            .requestAccessToken({ prompt: '' })
        })
        if (response.error || !response.access_token) {
          throw new Error(
            response.error_description ?? `Google sign-in failed (${response.error}).`,
          )
        }
        if (!client.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
          throw new Error('Google Drive access wasn’t allowed, so there is nowhere to sync to.')
        }
        if (!isCurrent()) return // Connect was pressed again since
        token = {
          value: response.access_token,
          expiresAt: now() + Number(response.expires_in ?? 3600) * 1000,
        }
        remember(true)
        setState('signed-in')
      })
    },

    async signOut() {
      attempts.abandon()
      // Revoking is a courtesy: an unrevoked token expires within the hour.
      if (token && gis) gis.revoke(token.value)
      token = null
      remember(false)
      setState('signed-out')
    },
  }
}

/** Load Google's script once, by adding a `<script>` tag. */
export function loadGisScript(): Promise<GoogleOAuth2> {
  return new Promise((resolve, reject) => {
    const loaded = () => (window as { google?: { accounts?: { oauth2?: GoogleOAuth2 } } }).google
    const ready = loaded()?.accounts?.oauth2
    if (ready) return resolve(ready)
    const script = document.createElement('script')
    script.src = GIS_URL
    script.async = true
    script.onload = () => {
      const oauth2 = loaded()?.accounts?.oauth2
      if (oauth2) resolve(oauth2)
      else reject(new Error('Google’s sign-in script loaded but did nothing.'))
    }
    script.onerror = () => {
      script.remove()
      reject(new Error('Couldn’t reach Google to sign in. Check the connection.'))
    }
    document.head.append(script)
  })
}
