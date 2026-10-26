/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** The app's version, from package.json (set in vite.config.ts). */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** The Google OAuth client (Web application) sync signs in with. Public;
   * see docs/architecture/sync.md, section 3. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** The desktop OAuth client's secret. Never committed: set it in
   * `.env.local`, or as the `GOOGLE_DESKTOP_CLIENT_SECRET` Actions secret. */
  readonly VITE_GOOGLE_DESKTOP_CLIENT_SECRET?: string
}
