// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parsePdf } from '../../src/parse/pdf'

interface Golden {
  words: string[]
  paraEnd: number[]
  pageStarts: Record<string, number>
}

// What the original Python reader (PyMuPDF) made of the same files — see
// tests/fixtures/legacy-pdf/README.md.
describe.each(['two-column-text', 'hyphenated-line-breaks'])('%s vs the Python reader', (name) => {
  const golden = JSON.parse(readFileSync(`tests/fixtures/legacy-pdf/${name}.json`, 'utf8')) as Golden

  async function parse() {
    const bytes = readFileSync(`tests/fixtures/${name}.pdf`)
    return parsePdf(new File([bytes], `${name}.pdf`))
  }

  it('reads the same words in the same order', async () => {
    const { tokens } = await parse()
    expect(tokens.map((t) => t.text)).toEqual(golden.words)
  })

  it('ends paragraphs in the same places', async () => {
    const { tokens } = await parse()
    const ends = tokens.flatMap((t, i) => (t.paraEnd ? [i] : []))
    expect(ends).toEqual(golden.paraEnd)
  })

  it('puts each page on the same word', async () => {
    const { tokens } = await parse()
    const starts: Record<string, number> = {}
    tokens.forEach((t, i) => {
      starts[t.page] ??= i
    })
    expect(starts).toEqual(golden.pageStarts)
  })
})
