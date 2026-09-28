import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { orpIndex } from '../../src/core/orp'
import { delayFor } from '../../src/core/pacing'
import { tokenizeText } from '../../src/core/tokenize'

const fixturesDir = join(process.cwd(), 'tests', 'fixtures')
const parityDir = join(process.cwd(), 'tests', 'parity')

interface GoldenToken {
  text: string
  paraEnd: boolean
  orp: number
  delayMs: Record<string, number>
}

interface GoldenFixture {
  source: string
  totalTokenCount: number
  truncated: boolean
  headCount: number
  tailCount: number
  tokens: GoldenToken[]
}

const TXT_BOOKS = ['stevenson-jekyll-and-hyde', 'melville-moby-dick'] as const

function loadGolden(name: string): GoldenFixture {
  return JSON.parse(readFileSync(join(parityDir, `${name}.json`), 'utf-8'))
}

function loadRawText(fileName: string): string {
  return readFileSync(join(fixturesDir, fileName), 'utf-8')
}

describe.each(TXT_BOOKS)('parity: %s', (name) => {
  const golden = loadGolden(name)
  const tokens = tokenizeText(loadRawText(golden.source))

  it('produces the same total token count as Python', () => {
    expect(tokens.length).toBe(golden.totalTokenCount)
  })

  it('matches token text, paraEnd, ORP index and delay exactly', () => {
    const sample = golden.truncated
      ? [
          ...tokens.slice(0, golden.headCount).map((t, i) => [t, golden.tokens[i]] as const),
          ...tokens
            .slice(-golden.tailCount)
            .map((t, i) => [t, golden.tokens[golden.headCount + i]] as const),
        ]
      : tokens.map((t, i) => [t, golden.tokens[i]] as const)

    for (const [token, expected] of sample) {
      if (expected === undefined) throw new Error('golden fixture shorter than sample')
      expect(token.text).toBe(expected.text)
      expect(token.paraEnd).toBe(expected.paraEnd)
      expect(orpIndex(token.text)).toBe(expected.orp)
      expect(delayFor(token, 300)).toBeCloseTo(expected.delayMs['300'] as number, 6)
      expect(delayFor(token, 600)).toBeCloseTo(expected.delayMs['600'] as number, 6)
    }
  })
})
