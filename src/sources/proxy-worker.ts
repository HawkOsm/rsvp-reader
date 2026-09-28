/**
 * A tiny Cloudflare Worker: forwards a GET request to www.gutenberg.org
 * and adds an Access-Control-Allow-Origin header, so the web build can
 * download a book file that gutenberg.org itself serves without CORS
 * headers (confirmed empirically — see DECISIONS.md's Phase 5 log).
 *
 * NOT part of the Vite app build — this is its own deployable unit. Not
 * deployed yet: that needs a Cloudflare account and `wrangler login`,
 * which this environment doesn't have. To deploy it yourself:
 *
 *   npx wrangler deploy src/sources/proxy-worker.ts --name rsvp-reader-gutenberg-proxy
 *
 * then set VITE_GUTENBERG_PROXY_URL (in .env.production or your CI/CD
 * secrets) to the resulting https://*.workers.dev URL.
 *
 * The upstream host is hardcoded, not read from the request — so there is
 * nothing here for a caller to point at an arbitrary site with. Only GET
 * requests to a gutenberg.org file path go anywhere; everything else gets
 * a 403.
 */

const UPSTREAM_ORIGIN = 'https://www.gutenberg.org'

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 })
    }

    const requestUrl = new URL(request.url)
    const upstreamUrl = new URL(requestUrl.pathname + requestUrl.search, UPSTREAM_ORIGIN)

    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      headers: { 'User-Agent': 'rsvp-reader-proxy (+https://github.com/HawkOsm/rsvp-reader)' },
    })

    const response = new Response(upstreamResponse.body, upstreamResponse)
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET')
    return response
  },
}
