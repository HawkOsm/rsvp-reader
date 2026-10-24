import type { Platform, ScreenLock } from './types'

// The browser and the installed PWA. Also the base the native shells build
// on: their webviews have the same web APIs.

/** The Screen Wake Lock API, where the browser has it (not Safari < 16.4). */
export async function requestWakeLock(): Promise<ScreenLock | null> {
  if (typeof navigator === 'undefined' || !navigator.wakeLock) return null
  try {
    const sentinel = await navigator.wakeLock.request('screen')
    return { release: () => void sentinel.release() }
  } catch {
    return null // refused, e.g. the page is not visible yet
  }
}

/** The browser toolbar colour on mobile browsers, from `<meta name="theme-color">`. */
function setThemeColorMeta(background: string): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
  }
  meta.content = background
}

export const webPlatform: Platform = {
  kind: 'web',
  selfUpdates: true,
  takeLaunchFile: async () => null,
  onBackButton: () => () => {},
  exit: () => {},
  setChromeColor: (background) => setThemeColorMeta(background),
  ready: () => {},
  keepScreenOn: requestWakeLock,
}
