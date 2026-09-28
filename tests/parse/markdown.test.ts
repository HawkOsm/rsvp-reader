import { describe, expect, it } from 'vitest'
import { stripMarkdown } from '../../src/parse/markdown'

describe('stripMarkdown', () => {
  it('strips ATX headers', () => {
    expect(stripMarkdown('# Title\n\n## Subtitle')).toBe('Title\n\nSubtitle')
  })

  it('strips emphasis and strong markers, keeping the text', () => {
    expect(stripMarkdown('*em* _also em_ **strong** __also strong__ ***both***')).toBe(
      'em also em strong also strong both',
    )
  })

  it('strips strikethrough', () => {
    expect(stripMarkdown('~~gone~~')).toBe('gone')
  })

  it('keeps link text, drops the URL', () => {
    expect(stripMarkdown('See [the docs](https://example.com/docs) for more.')).toBe(
      'See the docs for more.',
    )
  })

  it('keeps image alt text, drops the URL', () => {
    expect(stripMarkdown('![a cat](cat.png)')).toBe('a cat')
  })

  it('keeps inline code content, drops backticks', () => {
    expect(stripMarkdown('Run `npm test` first.')).toBe('Run npm test first.')
  })

  it('drops fenced code block markers', () => {
    expect(stripMarkdown('```js\nconst x = 1\n```')).toBe('\nconst x = 1\n')
  })

  it('strips blockquote markers', () => {
    expect(stripMarkdown('> A quote\n> continued')).toBe('A quote\ncontinued')
  })

  it('strips list markers, keeping indentation', () => {
    expect(stripMarkdown('- one\n- two\n  - nested')).toBe('one\ntwo\n  nested')
    expect(stripMarkdown('1. first\n2. second')).toBe('first\nsecond')
  })

  it('strips horizontal rules', () => {
    expect(stripMarkdown('above\n\n---\n\nbelow')).toBe('above\n\n\n\nbelow')
  })
})
