import { httpGet } from './http'

const GUTENDEX_BASE = 'https://gutendex.com'

export interface GutendexAuthor {
  name: string
  birthYear: number | null
  deathYear: number | null
}

export interface GutendexBook {
  id: number
  title: string
  authors: GutendexAuthor[]
  languages: string[]
  downloadCount: number
  /** Media type -> download URL, e.g. "application/epub+zip" -> "...". */
  formats: Record<string, string>
}

export interface GutendexSearchResult {
  count: number
  next: string | null
  previous: string | null
  results: GutendexBook[]
}

export class GutendexError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GutendexError'
  }
}

interface RawAuthor {
  name: string
  birth_year: number | null
  death_year: number | null
}

interface RawBook {
  id: number
  title: string
  authors?: RawAuthor[]
  languages?: string[]
  download_count?: number
  formats?: Record<string, string>
}

interface RawSearchResult {
  count: number
  next: string | null
  previous: string | null
  results: RawBook[]
}

function mapBook(raw: RawBook): GutendexBook {
  return {
    id: raw.id,
    title: raw.title,
    authors: (raw.authors ?? []).map((a) => ({
      name: a.name,
      birthYear: a.birth_year,
      deathYear: a.death_year,
    })),
    languages: raw.languages ?? [],
    downloadCount: raw.download_count ?? 0,
    formats: raw.formats ?? {},
  }
}

const REQUEST_TIMEOUT_MS = 15_000

async function requestJson<T>(url: string): Promise<T> {
  let response: Response
  try {
    response = await httpGet(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch (error) {
    throw new GutendexError(
      error instanceof DOMException && error.name === 'TimeoutError'
        ? 'Gutendex took too long to respond. Try again.'
        : 'Could not reach Gutendex. Check your connection and try again.',
    )
  }
  if (!response.ok) {
    throw new GutendexError(`Gutendex returned an error (${response.status}).`)
  }
  return response.json() as Promise<T>
}

export interface SearchOptions {
  page?: number
  /** ISO 639-1 codes, e.g. ["en", "tr"]. */
  languages?: string[]
}

export async function search(query: string, options: SearchOptions = {}): Promise<GutendexSearchResult> {
  const params = new URLSearchParams({ search: query })
  if (options.page && options.page > 1) params.set('page', String(options.page))
  if (options.languages && options.languages.length > 0) {
    params.set('languages', options.languages.join(','))
  }
  const raw = await requestJson<RawSearchResult>(`${GUTENDEX_BASE}/books?${params.toString()}`)
  return { count: raw.count, next: raw.next, previous: raw.previous, results: raw.results.map(mapBook) }
}

export async function getBook(id: number): Promise<GutendexBook> {
  const raw = await requestJson<RawBook>(`${GUTENDEX_BASE}/books/${id}`)
  return mapBook(raw)
}

export interface DownloadChoice {
  url: string
  kind: 'epub' | 'txt'
}

/** Prefer EPUB (keeps chapter structure); fall back to plain text. Neither
 * present (audio-only or image-only entries) -> null, and the caller shows
 * "no usable format" per the plan. */
export function pickDownloadFormat(book: GutendexBook): DownloadChoice | null {
  const epub = book.formats['application/epub+zip']
  if (epub) return { url: epub, kind: 'epub' }

  const txtKey = Object.keys(book.formats).find((key) => key.startsWith('text/plain'))
  if (txtKey) {
    const url = book.formats[txtKey]
    if (url) return { url, kind: 'txt' }
  }

  return null
}
