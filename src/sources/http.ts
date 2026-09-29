import { isTauri } from '@tauri-apps/api/core'

/**
 * The one place that knows how to make a cross-origin GET work, so
 * Gutendex search/import code doesn't care whether it's running in a
 * browser tab, Tauri or Capacitor.
 *
 * In Tauri: `@tauri-apps/plugin-http`'s `fetch` makes the request from the
 * Rust side, which never goes through the webview's CORS enforcement at
 * all — no proxy needed there (see capabilities/default.json for the
 * gutendex.com/gutenberg.org scope that permission requires).
 *
 * On the web: Gutendex's own API is called directly (a public API meant
 * for browser use); a Project Gutenberg *file* download is routed through
 * the small CORS-adding proxy in proxy-worker.ts, since gutenberg.org
 * itself doesn't send CORS headers (confirmed empirically — see
 * DECISIONS.md's Phase 5 log) and a direct fetch() would just fail.
 *
 * Capacitor gets the same platform check once that shell exists (Phase 8).
 */

const GUTENBERG_HOSTS = new Set(['www.gutenberg.org', 'gutenberg.org'])

function proxyBase(): string | undefined {
  return import.meta.env.VITE_GUTENBERG_PROXY_URL
}

export function needsProxy(url: string): boolean {
  try {
    return GUTENBERG_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

export async function httpGet(url: string, init: RequestInit = {}): Promise<Response> {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
    return tauriFetch(url, init)
  }

  if (needsProxy(url)) {
    const base = proxyBase()
    if (base) {
      const target = new URL(url)
      const proxied = `${base.replace(/\/$/, '')}${target.pathname}${target.search}`
      return fetch(proxied, init)
    }
    // No proxy configured: this will most likely fail with a CORS error in
    // a browser, but the failure itself is informative.
  }
  return fetch(url, init)
}
