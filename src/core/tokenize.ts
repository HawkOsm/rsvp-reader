import { makeToken, type Token } from './types'

// Ported from text_extract.py's normalize()/tokenize(). Keep the two in
// sync — tests/parity/*.json is generated from the Python side and this
// must match it token for token.

const SOFT_HYPHEN = '\u00ad'

// A hyphen at the end of a line, between two letters, is almost always a
// word broken across lines by the typesetter. Python's `\w` (Unicode mode)
// is approximated here with \p{L}\p{N}_; see DECISIONS.md.
const LINE_HYPHEN = /(?<=[\p{L}\p{N}_])[-\u2010\u2011]\n(?=[a-z\u00e0-\u00ff])/gu

// A single newline inside a paragraph is a soft wrap; a blank line is a
// real paragraph break.
const SOFT_WRAP = /(?<!\n)\n(?!\n)/g
const BLANK_LINES = /\n{2,}/g
const HORIZONTAL_SPACE = /[ \t\u00a0\u2007\u202f]+/g

/** Collapse a raw extraction into paragraphs separated by blank lines. */
export function normalize(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  text = text.split(SOFT_HYPHEN).join('').replace(/\f/g, '\n\n')
  text = text.replace(LINE_HYPHEN, '')
  text = text.replace(BLANK_LINES, '\n\n')
  text = text.replace(SOFT_WRAP, ' ')
  text = text.replace(HORIZONTAL_SPACE, ' ')
  return text.trim()
}

/** Split normalised text into display tokens, punctuation attached. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  for (const paragraph of text.split('\n\n')) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0)
    if (words.length === 0) continue
    for (let i = 0; i < words.length - 1; i++) {
      tokens.push(makeToken(words[i] as string))
    }
    tokens.push(makeToken(words[words.length - 1] as string, { paraEnd: true }))
  }
  return tokens
}

/** Convenience: normalized extraction text -> token list, in one call. */
export function tokenizeText(rawText: string): Token[] {
  return tokenize(normalize(rawText))
}
