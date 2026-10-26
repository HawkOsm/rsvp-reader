import { invoke } from '@tauri-apps/api/core'
import { createPkceAuth, type PkceNative } from './pkce-auth'
import type { Platform } from './types'
import { webPlatform } from './web'

// The desktop app (Tauri). Its webview is a browser, so most of the web
// platform applies; what differs is launching with a file, and updating.

/**
 * `rsvp-reader ~/books/essay.pdf`: the Rust side (src-tauri/src/lib.rs)
 * captures the launch argument and hands it back once, through the
 * `pending_open_file` command, so there is no race between the page
 * mounting and a Tauri event firing.
 */
async function takeLaunchFile(): Promise<File | null> {
  const path = await invoke<string | null>('pending_open_file')
  if (!path) return null
  const { readFile } = await import('@tauri-apps/plugin-fs')
  const bytes = await readFile(path)
  const fileName = path.split(/[/\\]/).pop() ?? path
  return new File([bytes], fileName)
}

/** The Google OAuth client (type "Desktop app") the desktop app signs in
 * with. The ID is public and belongs here (a placeholder until filled in).
 * The secret is never committed: it comes in at build time from
 * `VITE_GOOGLE_DESKTOP_CLIENT_SECRET` (`.env.local`, or a GitHub Actions
 * secret for release builds). A build without one can't sign in on the
 * desktop. */
const DESKTOP_CLIENT_ID = ''
const DESKTOP_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_SECRET ?? ''

/** Sign-in's native half: the commands in src-tauri/src/oauth.rs. */
const desktopSignIn: PkceNative = {
  async listen() {
    const port = await invoke<number>('oauth_listen')
    return { port, callback: () => invoke<string>('oauth_callback') }
  },
  openBrowser: (url) => invoke('oauth_open', { url }),
  async post(endpoint, form) {
    const [status, body] = await invoke<[number, string]>('oauth_post', { endpoint, form })
    return { status, body }
  },
  secrets: {
    get: (key) => invoke<string | null>('secret_get', { key }),
    set: (key, value) => invoke('secret_set', { key, value }),
    delete: (key) => invoke('secret_delete', { key }),
  },
}

export const tauriPlatform: Platform = {
  ...webPlatform,
  kind: 'desktop',
  selfUpdates: false, // a new version is a new installer
  // Google blocks sign-in inside a webview, so this goes through the system
  // browser (src/platform/pkce-auth.ts).
  syncAuth: createPkceAuth({
    clientId: DESKTOP_CLIENT_ID,
    clientSecret: DESKTOP_CLIENT_SECRET,
    native: desktopSignIn,
  }),
  takeLaunchFile,
  setChromeColor: () => {}, // the window frame is the system's
}
