/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the deployed Gutenberg CORS proxy (proxy-worker.ts). Unset
   * in dev/until deployed — see DECISIONS.md's Phase 5 log. */
  readonly VITE_GUTENBERG_PROXY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
