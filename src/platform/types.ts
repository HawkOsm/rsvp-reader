// What the app needs from the device it runs on. One interface, one
// implementation per shell (web.ts, tauri.ts, capacitor.ts), picked once at
// start-up by index.ts. Nothing outside src/platform asks which shell it is
// in, or imports @tauri-apps or @capacitor: it asks the platform.

export type PlatformKind = 'web' | 'desktop' | 'android'

/** A held "keep the screen on" request. */
export interface ScreenLock {
  release(): void
}

/** Where sync's sign-in stands (docs/architecture/sync.md, section 3).
 * `needs-reconnect`: the user connected before, but there is no good token
 * now (it expired, was refused, or the app was reopened), and getting one
 * needs them to press Reconnect. Reading carries on either way. */
export type SyncAuthState = 'signed-out' | 'signing-in' | 'signed-in' | 'needs-reconnect'

/** Access to the user's Google Drive for sync. The sync engine only ever
 * sees a token; how one is got depends on the shell. */
export interface SyncAuth {
  state(): SyncAuthState
  /** Call `listener` whenever the state changes. Returns a function that
   * stops calling it. */
  subscribe(listener: () => void): () => void
  /** A token that is still good, or `null`. Never asks the user. */
  getToken(): Promise<string | null>
  /** The last token was refused (a 401). A new one, if it can be had without
   * asking the user; otherwise `null`, and the state is `needs-reconnect`. */
  renewToken(): Promise<string | null>
  /** Ask the user to sign in. Call it from a click: it opens Google's window.
   * Rejects with a message to show if they don't finish. */
  signIn(): Promise<void>
  /** Forget the token, and that the user ever connected. */
  signOut(): Promise<void>
  /** Why the newest sign-in failed, even if it failed after `signIn` had
   * stopped waiting; `null` otherwise. Subscribers hear when it changes. */
  signInError(): string | null
  /** The address of the sign-in under way, where the shell opened one in the
   * browser (desktop), for the user to open somewhere else if their browser
   * gets in the way (a privacy extension). `null` otherwise. */
  signInLink(): string | null
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

  /** Sign-in for sync, or `null` where this shell can't sign in yet. */
  readonly syncAuth: SyncAuth | null
}
