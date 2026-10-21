import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.hawkosm.rsvpreader',
  appName: 'RSVP Reader',
  webDir: 'dist',
  // MuPDF's WebAssembly needs exception handling, which arrived in
  // WebView/Chrome 95. An older WebView would install the app and then fail
  // to open any PDF. With a minimum set, Capacitor shows `errorPath` instead
  // of the app (without one it only writes to the log).
  android: {
    minWebViewVersion: 95,
  },
  server: {
    errorPath: 'webview-too-old.html',
  },
}

export default config
