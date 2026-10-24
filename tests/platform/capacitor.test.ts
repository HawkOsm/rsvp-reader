import { describe, expect, it, vi } from 'vitest'

const remove = vi.fn(async () => {})
const listeners: (() => void)[] = []
const exitApp = vi.fn()
const setStyle = vi.fn()
const setBackgroundColor = vi.fn()
const hide = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async (_event: string, handler: () => void) => {
      listeners.push(handler)
      return { remove }
    },
    exitApp: () => exitApp(),
  },
}))
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle, setBackgroundColor },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}))
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide } }))

const { getPlatform } = await import('@/platform')

describe('the Android platform', () => {
  it('is picked inside Capacitor, and does not update itself', async () => {
    const platform = await getPlatform()
    expect(platform.kind).toBe('android')
    expect(platform.selfUpdates).toBe(false)
  })

  it('passes the back button on, and stops listening when asked', async () => {
    const platform = await getPlatform()
    const handler = vi.fn()
    const stop = platform.onBackButton(handler)
    await vi.waitFor(() => expect(listeners).toHaveLength(1))
    listeners[0]!()
    expect(handler).toHaveBeenCalled()
    stop()
    expect(remove).toHaveBeenCalled()
  })

  it('stops listening even if asked before the listener was registered', async () => {
    const platform = await getPlatform()
    remove.mockClear()
    platform.onBackButton(() => {})()
    await vi.waitFor(() => expect(remove).toHaveBeenCalled())
  })

  it('colours the status bar to the theme: light icons on dark, dark on light', async () => {
    const platform = await getPlatform()
    platform.setChromeColor('#16181d', true)
    expect(setStyle).toHaveBeenLastCalledWith({ style: 'DARK' })
    platform.setChromeColor('#fafafa', false)
    expect(setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' })
    expect(setBackgroundColor).toHaveBeenLastCalledWith({ color: '#fafafa' })
  })

  it('hides the splash screen when ready, and exits the app', async () => {
    const platform = await getPlatform()
    platform.ready()
    platform.exit()
    expect(hide).toHaveBeenCalled()
    expect(exitApp).toHaveBeenCalled()
  })
})
