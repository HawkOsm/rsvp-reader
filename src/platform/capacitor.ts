import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { createDeviceAuth, googlePost } from './device-auth'
import type { Platform } from './types'
import { webPlatform } from './web'

// The Android app (Capacitor). Its webview has the web APIs; the system
// chrome, the splash screen and the back button come from plugins.

function onBackButton(handler: () => void): () => void {
  let stopped = false
  let remove: (() => void) | undefined
  void App.addListener('backButton', handler).then((listener) => {
    if (stopped) void listener.remove()
    else remove = () => void listener.remove()
  })
  return () => {
    stopped = true
    remove?.()
  }
}

/** The Google OAuth client (type "TVs and Limited Input devices") the
 * Android app signs in with, by code. The ID is public and belongs here. The
 * secret is never committed: vite.config.ts
 * builds it in from `GOOGLE_DEVICE_CLIENT_SECRET`, in Android builds only. */
const ANDROID_CLIENT_ID = '78238404718-msqmnkuel9icuf4opu2u06i1b9b6m37r.apps.googleusercontent.com'

/** Where the saved sign-in is kept: the app's own storage, which other apps
 * can't read. Not Android's Keystore, which would need native code. */
const SECRET_PREFIX = 'rsvp-reader:secret:'
const appStorage = {
  get: async (key: string) => localStorage.getItem(SECRET_PREFIX + key),
  set: async (key: string, value: string) => localStorage.setItem(SECRET_PREFIX + key, value),
  delete: async (key: string) => localStorage.removeItem(SECRET_PREFIX + key),
}

export const capacitorPlatform: Platform = {
  ...webPlatform,
  kind: 'android',
  selfUpdates: false, // a new version is a new APK
  // A webview ignores download links; saving would need the Filesystem plugin.
  savesFiles: false,
  saveTextFile: async () => {},
  // Google blocks sign-in inside a webview, so this is by code, entered in
  // any browser (src/platform/device-auth.ts).
  syncAuth: createDeviceAuth({
    clientId: ANDROID_CLIENT_ID,
    clientSecret: __DEVICE_CLIENT_SECRET__,
    post: googlePost,
    secrets: appStorage,
  }),
  onBackButton,
  exit: () => void App.exitApp(),
  setChromeColor: (background, isDark) => {
    // Style.Dark means light icons, for a dark background.
    void StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
    void StatusBar.setBackgroundColor({ color: background })
  },
  ready: () => void SplashScreen.hide(),
}
