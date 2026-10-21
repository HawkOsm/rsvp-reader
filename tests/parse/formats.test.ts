import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { FormatId } from '../../src/core/types'
import {
  ACCEPTED_EXTENSIONS,
  FALLBACK_FORMAT,
  FORMAT_EXTENSIONS,
  FORMAT_IDS,
  formatOfFileName,
} from '../../src/parse/formats'
import { loadParser } from '../../src/parse/registry'

// One real file per format; text needs none. Typed so a new format without
// a fixture here is a compile error, not a confusing test failure.
const fixtures: Record<Exclude<FormatId, 'text'>, string> = {
  pdf: 'tests/fixtures/hyphenated-line-breaks.pdf',
  epub: 'tests/fixtures/austen-pride-and-prejudice.epub',
}

describe('formatOfFileName', () => {
  it.each([
    ['a.txt', 'text'],
    ['a.md', 'text'],
    ['a.markdown', 'text'],
    ['a.text', 'text'],
    ['a.rst', 'text'],
    ['a.org', 'text'],
    ['a.pdf', 'pdf'],
    ['a.epub', 'epub'],
    ['Book.PDF', 'pdf'],
    ['My.Story.EPUB', 'epub'],
  ])('%s is %s', (name, id) => {
    expect(formatOfFileName(name)).toBe(id)
  })

  it('has no format for an unknown extension or a name with no extension', () => {
    expect(formatOfFileName('mystery.xyz')).toBeUndefined()
    expect(formatOfFileName('README')).toBeUndefined()
  })

  it('falls back to text for files it does not recognise', () => {
    expect(FALLBACK_FORMAT).toBe('text')
  })

  it('never registers one extension for two formats', () => {
    const all = FORMAT_IDS.flatMap((id) => FORMAT_EXTENSIONS[id])
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('ACCEPTED_EXTENSIONS', () => {
  it('is exactly what the file picker offered before the registry existed', () => {
    expect([...ACCEPTED_EXTENSIONS].sort()).toEqual(
      ['.epub', '.markdown', '.md', '.org', '.pdf', '.rst', '.text', '.txt'].sort(),
    )
  })
})

describe('loadParser', () => {
  it.each(FORMAT_IDS)('the %s parser reports the id it is registered under', async (id) => {
    const file =
      id === 'text'
        ? new File(['Some plain words here.'], 'a.txt')
        : new File([readFileSync(fixtures[id])], `a.${FORMAT_EXTENSIONS[id][0]}`)
    const result = await (await loadParser(id))(file, {})
    expect(result.formatId).toBe(id)
  })
})
