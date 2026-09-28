import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { httpGet, needsProxy } from '../../src/sources/http'

describe('needsProxy', () => {
  it('is true for gutenberg.org and www.gutenberg.org', () => {
    expect(needsProxy('https://www.gutenberg.org/cache/epub/1342/pg1342.txt')).toBe(true)
    expect(needsProxy('https://gutenberg.org/ebooks/1342')).toBe(true)
  })

  it('is false for gutendex.com and other hosts', () => {
    expect(needsProxy('https://gutendex.com/books?search=x')).toBe(false)
    expect(needsProxy('https://example.com/file.txt')).toBe(false)
  })

  it('is false for an unparseable URL rather than throwing', () => {
    expect(needsProxy('not a url')).toBe(false)
  })
})

describe('httpGet', () => {
  const originalFetch = global.fetch
  const originalEnv = { ...import.meta.env }

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('ok'))
  })

  afterEach(() => {
    global.fetch = originalFetch
    Object.assign(import.meta.env, originalEnv)
    delete (import.meta.env as Record<string, unknown>).VITE_GUTENBERG_PROXY_URL
  })

  it('fetches a non-Gutenberg URL directly', async () => {
    await httpGet('https://gutendex.com/books?search=x')
    expect(fetch).toHaveBeenCalledWith('https://gutendex.com/books?search=x', {})
  })

  it('fetches a Gutenberg URL directly when no proxy is configured', async () => {
    await httpGet('https://www.gutenberg.org/cache/epub/1342/pg1342.txt')
    expect(fetch).toHaveBeenCalledWith('https://www.gutenberg.org/cache/epub/1342/pg1342.txt', {})
  })

  it('routes a Gutenberg URL through the proxy when configured', async () => {
    import.meta.env.VITE_GUTENBERG_PROXY_URL = 'https://proxy.example.workers.dev/'
    await httpGet('https://www.gutenberg.org/cache/epub/1342/pg1342.txt?x=1')
    expect(fetch).toHaveBeenCalledWith(
      'https://proxy.example.workers.dev/cache/epub/1342/pg1342.txt?x=1',
      {},
    )
  })
})
