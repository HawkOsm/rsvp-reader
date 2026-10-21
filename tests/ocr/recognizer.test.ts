import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRecognizer } from '../../src/ocr/recognizer'
import { ExtractionError } from '../../src/parse/errors'

// Starting Tesseract itself needs a browser; what is testable here is the
// part before it, which checks the engine and language files can be had.
// If they cannot, Tesseract would hang rather than say so.

afterEach(() => vi.unstubAllGlobals())

function stubFetch(handler: (url: string) => Response | Promise<Response> | never) {
  const fetchMock = vi.fn(async (url: string | URL | Request) => handler(String(url)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const ok = () => new Response('data')
const notFound = () => new Response('missing', { status: 404 })
const offline = () => {
  throw new TypeError('Failed to fetch')
}

describe('createRecognizer, before Tesseract starts', () => {
  it('explains when the files cannot be fetched (offline, first use)', async () => {
    stubFetch(offline)
    await expect(createRecognizer('eng')).rejects.toBeInstanceOf(ExtractionError)
    await expect(createRecognizer('eng')).rejects.toThrow(/connect to the internet/)
  })

  it('explains when a file is missing from the server', async () => {
    stubFetch(notFound)
    await expect(createRecognizer('eng')).rejects.toThrow(/connect to the internet/)
  })

  it('checks the engine, the worker script and every language asked for', async () => {
    const fetchMock = stubFetch(offline)
    await createRecognizer('eng+tur').catch(() => {})
    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls.some((u) => u.endsWith('/ocr/worker.min.js'))).toBe(true)
    expect(urls.some((u) => /\/ocr\/tesseract-core(-simd)?-lstm\.wasm\.js$/.test(u))).toBe(true)
    expect(urls.some((u) => u.endsWith('/ocr/lang/eng.traineddata.gz'))).toBe(true)
    expect(urls.some((u) => u.endsWith('/ocr/lang/tur.traineddata.gz'))).toBe(true)
  })

  it('fails if only one of the languages is unavailable', async () => {
    stubFetch((url) => (url.includes('tur.traineddata') ? notFound() : ok()))
    await expect(createRecognizer('eng+tur')).rejects.toThrow(/connect to the internet/)
  })

  it('reads each file to the end, so the service worker finishes caching it first', async () => {
    const read = vi.spyOn(Response.prototype, 'arrayBuffer')
    stubFetch(ok)
    // It goes on to start Tesseract, which cannot run here; only the checks matter.
    await createRecognizer('eng').catch(() => {})
    expect(read.mock.calls.length).toBeGreaterThanOrEqual(3) // worker, engine, language
    read.mockRestore()
  })
})
