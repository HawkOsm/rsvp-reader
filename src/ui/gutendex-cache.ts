import type { GutendexSearchResult, SearchOptions } from '../sources/gutendex'
import { search } from '../sources/gutendex'

const TTL_MS = 2 * 60 * 1000
const cache = new Map<string, { result: GutendexSearchResult; expiresAt: number }>()

function cacheKey(query: string, options: SearchOptions): string {
  return JSON.stringify([query, options.page ?? 1, options.languages ?? []])
}

/** Debounced-by-the-caller search results, cached briefly so retyping the
 * same query (or paging back) doesn't re-hit the network every time. */
export async function cachedSearch(
  query: string,
  options: SearchOptions = {},
): Promise<GutendexSearchResult> {
  const key = cacheKey(query, options)
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.result

  const result = await search(query, options)
  cache.set(key, { result, expiresAt: Date.now() + TTL_MS })
  return result
}
