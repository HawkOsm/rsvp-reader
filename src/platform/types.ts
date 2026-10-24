// What the app needs from the device it runs on. One interface, one
// implementation per shell (web.ts, tauri.ts, capacitor.ts), picked once at
// start-up by index.ts. Nothing outside src/platform asks which shell it is
// in, or imports @tauri-apps or @capacitor: it asks the platform.

export type PlatformKind = 'web' | 'desktop' | 'android'

/** A held "keep the screen on" request. */
export interface ScreenLock {
  release(): void
}

export interface Platform {
  readonly kind: PlatformKind

  /** Whether the app updates itself in place (a PWA's service worker).
   * Native builds update by installing a new version instead, and must not
   * run a service worker that could keep serving the old files. */
  readonly selfUpdates: boolean

  /** The file the app was launched to open (`rsvp-reader book.pdf` on the
   * desktop), handed over once; `null` everywhere else. */
  takeLaunchFile(): Promise<File | null>

  /** Listen for the system back button (Android). Returns a function that
   * stops listening. */
  onBackButton(handler: () => void): () => void

  /** Leave the app (Android's back button on the first screen). */
  exit(): void

  /** Colour the system chrome around the app (status bar, browser toolbar)
   * to match the app's background. */
  setChromeColor(background: string, isDark: boolean): void

  /** The first screen has been drawn: hide the splash screen. */
  ready(): void

  /** Keep the screen from dimming while reading. `null` if the device
   * refuses or cannot; losing it is an inconvenience, not an error. */
  keepScreenOn(): Promise<ScreenLock | null>
}
