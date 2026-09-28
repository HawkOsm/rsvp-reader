/**
 * The one place that knows how to make a cross-origin GET work, so
 * Gutendex search/import code doesn't care whether it's running in a
 * browser tab, Tauri or Capacitor.
 *
 * On the web: Gutendex's own API is called directly (a public API meant
 * for browser use); a Project Gutenberg *file* download is routed through
 * the small CORS-adding proxy in proxy-worker.ts, since gutenberg.org
 * itself doesn't send CORS headers (confirmed empirically — see
 * DECISIONS.md's Phase 5 log) and a direct fetch() would just fail.
 *
 * Tauri and Capacitor both skip browser CORS entirely via their own native
 * HTTP plugins — once those shells exist (Phase 7/8), this file gets a
 * platform check and calls the matching plugin instead of fetch().
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
  if (needsProxy(url)) {
    const base = proxyBase()
    if (base) {
      const target = new URL(url)
      const proxied = `${base.replace(/\/$/, '')}${target.pathname}${target.search}`
      return fetch(proxied, init)
    }
    // No proxy configured: this will most likely fail with a CORS error in
    // a browser, but the failure itself is informative (and this still
    // works unmodified once a platform HTTP plugin replaces this function).
  }
  return fetch(url, init)
}
