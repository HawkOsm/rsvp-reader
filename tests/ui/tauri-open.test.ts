import { describe, expect, it } from 'vitest'
import { pendingOpenFile } from '../../src/ui/tauri-open'

describe('pendingOpenFile', () => {
  it('resolves to null outside Tauri, without touching any Tauri plugin', async () => {
    // jsdom has no window.__TAURI_INTERNALS__, so isTauri() is false and
    // this should short-circuit before importing @tauri-apps/plugin-fs —
    // if it didn't, this test would blow up trying to use a plugin that
    // only works inside a real Tauri webview.
    await expect(pendingOpenFile()).resolves.toBeNull()
  })
})
