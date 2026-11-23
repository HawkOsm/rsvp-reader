import { DRIVE_SCOPE } from './google-auth'
import { createInstalledAuth, type InstalledAuthBackend } from './installed-auth'
import type { SyncAuth } from './types'

// Sign-in for sync with a code (Google's "device flow", for the client type
// "TVs and Limited Input devices"; docs/architecture/sync.md, section 3).
// The app shows a short code; the user enters it at google.com/device in any
// browser, on this device or another, and the app asks Google every few
// seconds whether they have. Nothing has to come back to the app through the
// browser, so it needs no redirect address, no signing-key fingerprint and no
// native code: on Android it is the whole of sign-in. Keeping and renewing
// the tokens is `installed-auth.ts`.

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'

const ENDPOINTS = {
  device: 'https://oauth2.googleapis.com/device/code',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
} as const

export type DevicePost = (
  endpoint: keyof typeof ENDPOINTS,
  form: Record<string, string>,
) => Promise<{ status: number; body: string }>

/** POST a form to one of Google's sign-in endpoints with `fetch`. They
 * answer requests from any web origin, an app's webview included. */
export const googlePost: DevicePost = async (endpoint, form) => {
  const response = await fetch(ENDPOINTS[endpoint], {
    method: 'POST',
    body: new URLSearchParams(form),
  })
  return { status: response.status, body: await response.text() }
}

export interface DeviceAuthOptions {
  clientId: string
  /** This client type has a secret too, and Google expects it sent; like
   * the desktop one, it isn't confidential in an installed app. */
  clientSecret?: string
  post: DevicePost
  secrets: InstalledAuthBackend['secrets']
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** How long Connect waits before giving the button back. */
  signInTimeoutMs?: number
}

interface DeviceCode {
  device_code?: string
  user_code?: string
  verification_url?: string
  expires_in?: number
  interval?: number
  error?: string
  error_description?: string
}

export function createDeviceAuth({
  clientId,
  clientSecret,
  post,
  secrets,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  signInTimeoutMs,
}: DeviceAuthOptions): SyncAuth {
  return createInstalledAuth({
    clientId,
    clientSecret,
    backend: { post, secrets },
    now,
    signInTimeoutMs,
    /** One sign-in: get a code, show it, and ask until it has been used. */
    async authorize(step) {
      const asked = await post('device', { client_id: clientId, scope: DRIVE_SCOPE })
      let code: DeviceCode
      try {
        code = JSON.parse(asked.body) as DeviceCode
      } catch {
        code = { error: 'bad_response' }
      }
      if (!code.device_code || !code.user_code || !code.verification_url) {
        throw new Error(code.error_description ?? `Google sign-in failed (${code.error}).`)
      }
      step.show({ link: code.verification_url, code: code.user_code })

      const until = now() + (code.expires_in ?? 1800) * 1000
      let interval = (code.interval ?? 5) * 1000
      while (now() < until) {
        await sleep(interval)
        if (!step.isCurrent()) return null
        const body = await step.tokenRequest({
          grant_type: DEVICE_GRANT,
          device_code: code.device_code,
        })
        if (body.access_token) return body
        switch (body.error) {
          case 'authorization_pending':
            break // not entered yet: ask again
          case 'slow_down':
            interval += 5000
            break
          case 'access_denied':
            throw new Error('Google Drive access wasn’t allowed.')
          case 'expired_token':
            throw new Error('The code ran out before it was used. Press Connect for a new one.')
          default:
            return body // any other answer is a failure, reported by its own words
        }
      }
      throw new Error('The code ran out before it was used. Press Connect for a new one.')
    },
  })
}
