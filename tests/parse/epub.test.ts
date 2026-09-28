import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ExtractionError } from '../../src/parse/errors'
import { parseEpub } from '../../src/parse/epub'

function fixtureFile(name: string): File {
  return new File([readFileSync(`tests/fixtures/${name}`)], name, {
    type: 'application/epub+zip',
  })
}

describe('parseEpub', () => {
  it('extracts a real Gutenberg EPUB with title, author, tokens and chapters', async () => {
    const result = await parseEpub(fixtureFile('austen-pride-and-prejudice.epub'))

    expect(result.title).toBe('Pride and Prejudice')
    expect(result.author).toBe('Jane Austen')
    // A full novel: real word count for P&P is ~122k; front matter adds a
    // bit more. Loosely bounded rather than pinned exactly, since it would
    // shift with any future change to how front-matter boilerplate reads.
    expect(result.tokens.length).toBeGreaterThan(120_000)
    expect(result.tokens.length).toBeLessThan(135_000)

    const chapterTitles = result.chapters?.map((c) => c.title) ?? []
    expect(chapterTitles).toContain('Chapter I.')
    expect(chapterTitles).toContain('CHAPTER II.')
    // The illustration caption embedded in this book's <h2> markup must not
    // leak into the chapter title (see content.ts's .caption stripping).
    expect(chapterTitles.some((t) => t.includes('will like it'))).toBe(false)

    // Chapter start indices are strictly increasing and land on real tokens.
    const starts = result.chapters?.map((c) => c.startTokenIndex) ?? []
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]).toBeGreaterThan(starts[i - 1] as number)
    }
    for (const start of starts) {
      expect(start).toBeLessThan(result.tokens.length)
    }
  })

  it('reports progress once per spine document', async () => {
    const fractions: number[] = []
    await parseEpub(fixtureFile('austen-pride-and-prejudice.epub'), {
      onProgress: (p) => fractions.push(p.fraction),
    })
    expect(fractions.length).toBeGreaterThan(1)
    expect(fractions[fractions.length - 1]).toBe(1)
  })

  it('can be cancelled via AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      parseEpub(fixtureFile('austen-pride-and-prejudice.epub'), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects a file that is not a zip at all', async () => {
    const bogus = new File(['not a zip'], 'fake.epub', { type: 'application/epub+zip' })
    await expect(parseEpub(bogus)).rejects.toThrow(ExtractionError)
  })

  it('rejects a zip with no META-INF/container.xml', async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('mimetype', 'application/epub+zip')
    const blob = await zip.generateAsync({ type: 'blob' })
    const file = new File([blob], 'no-container.epub', { type: 'application/epub+zip' })
    await expect(parseEpub(file)).rejects.toThrow(ExtractionError)
  })
})
