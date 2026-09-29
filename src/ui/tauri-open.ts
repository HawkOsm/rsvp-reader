import { isTauri } from '@tauri-apps/api/core'

/**
 * `rsvp-reader ~/books/essay.pdf` — the desktop Python app's own
 * command-line-open behavior, ported. The Rust side (src-tauri/src/lib.rs)
 * captures the launch argument and hands it back once, via the
 * `pending_open_file` command, so there's no startup race between the
 * frontend mounting and a Tauri event firing.
 *
 * Not exercised by any test — it only does anything inside a real Tauri
 * build, which nothing in this repo's test suite runs.
 */
export async function pendingOpenFile(): Promise<File | null> {
  if (!isTauri()) return null

  const { invoke } = await import('@tauri-apps/api/core')
  const path = await invoke<string | null>('pending_open_file')
  if (!path) return null

  const { readFile } = await import('@tauri-apps/plugin-fs')
  const bytes = await readFile(path)
  const fileName = path.split(/[/\\]/).pop() ?? path
  return new File([bytes], fileName)
}
