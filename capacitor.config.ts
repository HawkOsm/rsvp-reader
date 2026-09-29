import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.hawkosm.rsvpreader',
  appName: 'RSVP Reader',
  webDir: 'dist',
  plugins: {
    // Patches window.fetch/XMLHttpRequest to route through native
    // networking, the same way Tauri's http plugin does (Phase 7) — skips
    // WebView CORS entirely for the Gutendex/Gutenberg calls from Phase 5,
    // with zero code changes needed in src/sources/http.ts.
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
