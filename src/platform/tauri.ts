import { invoke } from '@tauri-apps/api/core'
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

export const tauriPlatform: Platform = {
  ...webPlatform,
  kind: 'desktop',
  selfUpdates: false, // a new version is a new installer
  takeLaunchFile,
  setChromeColor: () => {}, // the window frame is the system's
}
