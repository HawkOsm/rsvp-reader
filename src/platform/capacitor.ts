import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
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

export const capacitorPlatform: Platform = {
  ...webPlatform,
  kind: 'android',
  selfUpdates: false, // a new version is a new APK
  // Google blocks sign-in in a webview: phase 5 signs in through the system browser.
  syncAuth: null,
  onBackButton,
  exit: () => void App.exitApp(),
  setChromeColor: (background, isDark) => {
    // Style.Dark means light icons, for a dark background.
    void StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
    void StatusBar.setBackgroundColor({ color: background })
  },
  ready: () => void SplashScreen.hide(),
}
