import { useEffect } from 'react'
import { DARK_PALETTE, resolvePalette } from '@/lib/theme'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/stores/app-store'

/** Keeps the system chrome (Android's status bar, a mobile browser's
 * toolbar) the colour of the app's background, following the theme, and
 * hides the splash screen once the app has drawn. */
export function useSystemChrome(): void {
  const theme = useAppStore((s) => s.theme)

  useEffect(() => {
    void getPlatform().then((platform) => platform.ready())
  }, [])

  useEffect(() => {
    function apply() {
      const palette = resolvePalette(theme)
      void getPlatform().then((platform) =>
        platform.setChromeColor(palette.bg, palette === DARK_PALETTE),
      )
    }
    apply()
    // 'system' follows the device, which can change while the app is open.
    const query = window.matchMedia?.('(prefers-color-scheme: light)')
    query?.addEventListener('change', apply)
    return () => query?.removeEventListener('change', apply)
  }, [theme])
}
