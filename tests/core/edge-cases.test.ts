import { describe, expect, it } from 'vitest'
import { orpIndex } from '../../src/core/orp'
import { delayFor } from '../../src/core/pacing'
import { normalize, tokenize, tokenizeText } from '../../src/core/tokenize'
import { makeToken } from '../../src/core/types'

// Expected values below were computed by calling rsvp_engine.py's
// delay_for()/orp_index() directly on the same inputs (not re-derived by
// hand), so this is a small hand-picked parity check rather than a guess
// at what "should" happen. See tests/parity/ for the bulk fixture-driven
// version of the same check.
const WORD_CASES: {
  word: string
  orp: number
  delay300: number
  delay600: number
}[] = [
  { word: 'wait—', orp: 1, delay300: 300.0, delay600: 150.0 }, // em dash
  { word: 'wait…', orp: 1, delay300: 500.0, delay600: 250.0 }, // ellipsis
  { word: 'Stop!"', orp: 1, delay300: 500.0, delay600: 250.0 }, // quote after !
  { word: 'Really?”', orp: 2, delay300: 500.0, delay600: 250.0 }, // curly quote after ?
  { word: 'end.")', orp: 1, delay300: 500.0, delay600: 250.0 }, // nested closers after .
  { word: '3.14', orp: 1, delay300: 200.0, delay600: 100.0 }, // decimal number, mid-token dot
  { word: '3.14.', orp: 1, delay300: 500.0, delay600: 250.0 }, // decimal number ending a sentence
  {
    word: 'https://example.com/path,',
    orp: 4,
    delay300: 1110.0,
    delay600: 960.0,
  }, // URL with trailing comma
  {
    word: 'pneumonoultramicroscopicsilicovolcanoconiosis', // 46 chars
    orp: 4,
    delay300: 1370.0,
    delay600: 1270.0,
  },
  { word: 'çalışma', orp: 2, delay300: 230.0, delay600: 130.0 }, // Turkish "çalışma"
  { word: 'sağ', orp: 1, delay300: 200.0, delay600: 100.0 }, // Turkish "sağ"
  { word: '(parenthetical)', orp: 4, delay300: 410.0, delay600: 310.0 },
  { word: '"quoted"', orp: 3, delay300: 200.0, delay600: 100.0 },
]

describe('punctuation, numbers, URLs, long words and Turkish letters', () => {
  it.each(WORD_CASES)('$word', ({ word, orp, delay300, delay600 }) => {
    const token = makeToken(word)
    expect(orpIndex(word)).toBe(orp)
    expect(delayFor(token, 300)).toBeCloseTo(delay300, 6)
    expect(delayFor(token, 600)).toBeCloseTo(delay600, 6)
  })
})

describe('empty input', () => {
  it('normalize("") is ""', () => {
    expect(normalize('')).toBe('')
  })

  it('tokenizeText("") is []', () => {
    expect(tokenizeText('')).toEqual([])
  })

  it('a paragraph of only whitespace produces no tokens', () => {
    expect(tokenize('   \n\n\t\n\n')).toEqual([])
  })
})

describe('paragraph structure', () => {
  it('collapses soft wraps, multi-blank-lines and runs of spaces', () => {
    const raw =
      'Para one line one\nline two.\n\nPara two   with  extra   spaces.\n\n\n\nPara three.'
    expect(normalize(raw)).toBe(
      'Para one line one line two.\n\nPara two with extra spaces.\n\nPara three.',
    )
    const tokens = tokenize(normalize(raw))
    expect(tokens.map((t) => [t.text, t.paraEnd])).toEqual([
      ['Para', false],
      ['one', false],
      ['line', false],
      ['one', false],
      ['line', false],
      ['two.', true],
      ['Para', false],
      ['two', false],
      ['with', false],
      ['extra', false],
      ['spaces.', true],
      ['Para', false],
      ['three.', true],
    ])
  })

  it('rejoins a word hyphenated across a line break', () => {
    const raw = 'This is a hyphen-\nated word test, and under-\nstand it.'
    expect(normalize(raw)).toBe('This is a hyphenated word test, and understand it.')
  })

  it('does not rejoin a real hyphen followed by a capital (not a line break)', () => {
    // The hyphen-rejoin regex only fires when followed by a newline, so a
    // genuine mid-line hyphen (compound word) is untouched either way —
    // this just guards against the regex being loosened by accident.
    const raw = 'A well-known fact.'
    expect(normalize(raw)).toBe('A well-known fact.')
  })
})
