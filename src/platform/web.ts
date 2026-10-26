import { createGoogleAuth, loadGisScript } from './google-auth'
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

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** The Google OAuth client (type "Web application") sync signs in with. A
 * client ID is a public identifier and belongs in the build; a client secret
 * never does. `VITE_GOOGLE_CLIENT_ID` in `.env.local` overrides it for local
 * testing. */
const GOOGLE_CLIENT_ID = '78238404718-b5e9n4fqr0j398r9ikojujijdu3bchqt.apps.googleusercontent.com'

export const webPlatform: Platform = {
  kind: 'web',
  selfUpdates: true,
  takeLaunchFile: async () => null,
  onBackButton: () => () => {},
  exit: () => {},
  setChromeColor: (background) => setThemeColorMeta(background),
  ready: () => {},
  keepScreenOn: requestWakeLock,
  // A build without a client ID still shows Connect, and says why it can't.
  syncAuth: createGoogleAuth({
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID,
    loadGis: loadGisScript,
    storage: browserStorage(),
  }),
}
