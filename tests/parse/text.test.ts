import { describe, expect, it } from 'vitest'
import { ExtractionError } from '@/parse/errors'
import { parseTextFile } from '@/parse/text'

function textFile(content: string, name = 'book.txt'): File {
  return new File([content], name, { type: 'text/plain' })
}

describe('parseTextFile', () => {
  it('tokenizes plain UTF-8 text', async () => {
    const result = await parseTextFile(textFile('Hello world.\n\nA second paragraph.'))
    expect(result.title).toBe('book')
    expect(result.tokens.map((t) => t.text)).toEqual([
      'Hello',
      'world.',
      'A',
      'second',
      'paragraph.',
    ])
    expect(result.tokens.map((t) => t.paraEnd)).toEqual([false, true, false, false, true])
  })

  it('falls back to windows-1254 when the bytes are not valid UTF-8', async () => {
    // 0xDD is "İ" in windows-1254 but an invalid UTF-8 lead byte followed
    // by the non-continuation byte "s" — TextDecoder(fatal: true) throws.
    const bytes = new Uint8Array([0xdd, ...'stanbul'.split('').map((c) => c.charCodeAt(0))])
    const file = new File([bytes], 'turkish.txt', { type: 'text/plain' })

    const result = await parseTextFile(file)
    expect(result.tokens.map((t) => t.text)).toEqual(['İstanbul'])
  })

  it('strips Markdown syntax for .md files but not for .txt', async () => {
    const md = await parseTextFile(
      textFile('# Heading\n\nSome **bold** and [a link](http://x) text.', 'notes.md'),
    )
    expect(md.tokens.map((t) => t.text)).toEqual([
      'Heading',
      'Some',
      'bold',
      'and',
      'a',
      'link',
      'text.',
    ])

    const txt = await parseTextFile(textFile('# Not a heading', 'notes.txt'))
    expect(txt.tokens.map((t) => t.text)).toEqual(['#', 'Not', 'a', 'heading'])
  })

  it('throws ExtractionError for an empty file', async () => {
    await expect(parseTextFile(textFile('   \n\n  '))).rejects.toThrow(ExtractionError)
  })

  it('uses the file name (without extension) as the title', async () => {
    const result = await parseTextFile(textFile('Word.', 'My Great Novel.txt'))
    expect(result.title).toBe('My Great Novel')
  })

  // A file that is not text at all. Every byte is a character in
  // windows-1254, so the fallback above "decodes" anything: a JPEG named
  // b13fee8d-cf1e-4581-b8ea-a500a2e097d2 (no extension) once opened as a
  // book of "ÿØÿà JFIF ICC_PROFILE mntrRGB XYZ …".
  it.each([
    ['a JPEG', jpegBytes()],
    ['a PNG', pngBytes()],
    ['a ZIP', zipBytes()],
  ])('refuses %s instead of reading its bytes as words', async (_what, bytes) => {
    const file = new File([bytes], 'b13fee8d-cf1e-4581-b8ea-a500a2e097d2')
    await expect(parseTextFile(file)).rejects.toThrow(ExtractionError)
  })

  it('still reads old Turkish text, whose bytes are not UTF-8 either', async () => {
    // "Çağdaş Türk şiiri, İstanbul'da doğdu." in windows-1254.
    const bytes = new Uint8Array([
      0xc7, 0x61, 0xf0, 0x64, 0x61, 0xfe, 0x20, 0x54, 0xfc, 0x72, 0x6b, 0x20, 0xfe, 0x69, 0x69,
      0x72, 0x69, 0x2c, 0x20, 0xdd, 0x73, 0x74, 0x61, 0x6e, 0x62, 0x75, 0x6c, 0x27, 0x64, 0x61,
      0x20, 0x64, 0x6f, 0xf0, 0x64, 0x75, 0x2e,
    ])
    const result = await parseTextFile(new File([bytes], 'siir'))
    expect(result.tokens.map((t) => t.text)).toEqual([
      'Çağdaş',
      'Türk',
      'şiiri,',
      "İstanbul'da",
      'doğdu.',
    ])
  })
})

/** Bytes that are no text: a repeatable scramble, as compressed data is. */
function noise(length: number): number[] {
  let seed = 0x2f6e2b1
  return Array.from({ length }, () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return (seed >> 16) & 0xff
  })
}

/** The start of a real JPEG (the one in the report: JFIF, then an ICC
 * profile), and scrambled bytes where its picture would be. */
function jpegBytes() {
  const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))
  return new Uint8Array([
    ...[0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10],
    ...ascii('JFIF'),
    ...[0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xe2, 0x01, 0xd8],
    ...ascii('ICC_PROFILE'),
    ...[0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0xc8, 0x00, 0x00, 0x00, 0x00, 0x04, 0x30, 0x00, 0x00],
    ...ascii('mntrRGB XYZ '),
    ...noise(4000),
  ])
}

function pngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...noise(4000)])
}

function zipBytes() {
  return new Uint8Array([
    0x50,
    0x4b,
    0x03,
    0x04,
    0x14,
    0x00,
    0x00,
    0x00,
    0x08,
    0x00,
    ...noise(4000),
  ])
}
