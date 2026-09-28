import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GutendexError, getBook, pickDownloadFormat, search } from '../../src/sources/gutendex'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const SAMPLE_RAW_BOOK = {
  id: 1342,
  title: 'Pride and Prejudice',
  authors: [{ name: 'Austen, Jane', birth_year: 1775, death_year: 1817 }],
  languages: ['en'],
  download_count: 100000,
  formats: {
    'application/epub+zip': 'https://www.gutenberg.org/ebooks/1342.epub.images',
    'text/plain; charset=us-ascii': 'https://www.gutenberg.org/files/1342/1342-0.txt',
  },
}

describe('gutendex search/getBook', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('search() maps the raw response into camelCase, with authors and formats intact', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ count: 1, next: null, previous: null, results: [SAMPLE_RAW_BOOK] }),
    )

    const result = await search('pride and prejudice')

    expect(result.count).toBe(1)
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toEqual({
      id: 1342,
      title: 'Pride and Prejudice',
      authors: [{ name: 'Austen, Jane', birthYear: 1775, deathYear: 1817 }],
      languages: ['en'],
      downloadCount: 100000,
      formats: SAMPLE_RAW_BOOK.formats,
    })
  })

  it('search() sends the query and language filter as URL params', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ count: 0, next: null, previous: null, results: [] }),
    )

    await search('pride', { languages: ['en', 'tr'], page: 2 })

    const calledUrl = vi.mocked(fetch).mock.calls[0]?.[0] as string
    const url = new URL(calledUrl)
    expect(url.searchParams.get('search')).toBe('pride')
    expect(url.searchParams.get('languages')).toBe('en,tr')
    expect(url.searchParams.get('page')).toBe('2')
  })

  it('getBook() fetches a single book by id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(SAMPLE_RAW_BOOK))
    const book = await getBook(1342)
    expect(book.title).toBe('Pride and Prejudice')
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('https://gutendex.com/books/1342')
  })

  it('throws GutendexError on a non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: 'not found' }, 404))
    await expect(getBook(999999999)).rejects.toThrow(GutendexError)
  })

  it('throws GutendexError when the network request itself fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(search('x')).rejects.toThrow(GutendexError)
  })

  it('throws a specific GutendexError message when the request times out', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException('The signal timed out', 'TimeoutError'))
    await expect(search('x')).rejects.toThrow(/too long/i)
  })
})

describe('pickDownloadFormat', () => {
  it('prefers EPUB when available', () => {
    const choice = pickDownloadFormat({
      id: 1,
      title: 't',
      authors: [],
      languages: ['en'],
      downloadCount: 0,
      formats: {
        'application/epub+zip': 'https://x/book.epub',
        'text/plain; charset=us-ascii': 'https://x/book.txt',
      },
    })
    expect(choice).toEqual({ url: 'https://x/book.epub', kind: 'epub' })
  })

  it('falls back to plain text when there is no EPUB', () => {
    const choice = pickDownloadFormat({
      id: 1,
      title: 't',
      authors: [],
      languages: ['en'],
      downloadCount: 0,
      formats: { 'text/plain; charset=utf-8': 'https://x/book.txt' },
    })
    expect(choice).toEqual({ url: 'https://x/book.txt', kind: 'txt' })
  })

  it('returns null when neither format is available (e.g. audio-only)', () => {
    const choice = pickDownloadFormat({
      id: 1,
      title: 't',
      authors: [],
      languages: ['en'],
      downloadCount: 0,
      formats: { 'audio/mpeg': 'https://x/book.mp3' },
    })
    expect(choice).toBeNull()
  })
})
