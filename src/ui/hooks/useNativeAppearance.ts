import { useEffect } from 'react'

/**
 * Native-shell chrome that has nothing to do with the app's own UI: the
 * Android status bar color (matched to the dark palette so it doesn't
 * look like an unstyled default) and hiding the splash screen once React
 * has actually mounted, rather than on a fixed timer.
 *
 * A no-op on web/Tauri — both dynamic imports only resolve to anything on
 * a native Capacitor platform.
 */
export function useNativeAppearance(): void {
  useEffect(() => {
    void (async () => {
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) return

      const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
        import('@capacitor/status-bar'),
        import('@capacitor/splash-screen'),
      ])

      await StatusBar.setStyle({ style: Style.Dark })
      await StatusBar.setBackgroundColor({ color: '#16181d' })
      await SplashScreen.hide()
    })()
  }, [])
}
