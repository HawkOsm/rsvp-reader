import { describe, expect, it } from 'vitest'
import { ExtractionError } from '../../src/parse/errors'
import { parseTextFile } from '../../src/parse/text'

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
})
