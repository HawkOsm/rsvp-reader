import { describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: (...a: unknown[]) => invoke(...a),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: async () => new TextEncoder().encode('hello'),
}))

const { getPlatform } = await import('@/platform')

describe('the desktop platform', () => {
  it('is picked inside Tauri, and does not update itself', async () => {
    const platform = await getPlatform()
    expect(platform.kind).toBe('desktop')
    expect(platform.selfUpdates).toBe(false)
  })

  it('hands over the file the app was launched with, named as on disk', async () => {
    invoke.mockResolvedValueOnce('/home/me/books/essay.pdf')
    const file = await (await getPlatform()).takeLaunchFile()
    expect(invoke).toHaveBeenCalledWith('pending_open_file')
    expect(file?.name).toBe('essay.pdf')
    expect(await file?.text()).toBe('hello')
  })

  it('has no file when launched without one', async () => {
    invoke.mockResolvedValueOnce(null)
    await expect((await getPlatform()).takeLaunchFile()).resolves.toBeNull()
  })

  it('signs in through the system browser, reading the keychain only once asked', async () => {
    invoke.mockClear()
    const auth = (await getPlatform()).syncAuth!
    expect(auth.state()).toBe('signed-out')
    expect(invoke).not.toHaveBeenCalled()
    invoke.mockResolvedValueOnce(null) // nothing in the keychain
    auth.subscribe(() => {})
    await new Promise((r) => setTimeout(r, 0))
    expect(invoke).toHaveBeenCalledWith('secret_get', { key: 'google-refresh-token' })
    expect(auth.state()).toBe('signed-out')
  })
})
