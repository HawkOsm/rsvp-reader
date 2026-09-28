import { describe, expect, it } from 'vitest'
import { extractBlocks } from '../../../src/parse/epub/content'

function parse(html: string): Document {
  return new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html')
}

describe('extractBlocks', () => {
  it('walks p, h1-h6 and li in document order', () => {
    const blocks = extractBlocks(
      parse('<h1>Title</h1><p>First.</p><h2>Sub</h2><ul><li>One</li><li>Two</li></ul>'),
    )
    expect(blocks).toEqual([
      { tag: 'h1', text: 'Title' },
      { tag: 'p', text: 'First.' },
      { tag: 'h2', text: 'Sub' },
      { tag: 'li', text: 'One' },
      { tag: 'li', text: 'Two' },
    ])
  })

  it('collapses internal whitespace from source formatting', () => {
    const blocks = extractBlocks(parse('<p>This is\n      a paragraph\n      with wraps.</p>'))
    expect(blocks[0]?.text).toBe('This is a paragraph with wraps.')
  })

  it('skips empty blocks', () => {
    const blocks = extractBlocks(parse('<p>   </p><p>Real text.</p>'))
    expect(blocks).toEqual([{ tag: 'p', text: 'Real text.' }])
  })

  it('skips content inside <nav>', () => {
    const blocks = extractBlocks(
      parse('<nav><p>Table of contents entry.</p></nav><p>Real body text.</p>'),
    )
    expect(blocks).toEqual([{ tag: 'p', text: 'Real body text.' }])
  })

  it('does not double-count a block wrapping another block (li > p)', () => {
    const blocks = extractBlocks(parse('<ul><li><p>Nested paragraph.</p></li></ul>'))
    expect(blocks).toEqual([{ tag: 'p', text: 'Nested paragraph.' }])
  })

  it('strips a footnote-marker link but keeps the surrounding prose', () => {
    const blocks = extractBlocks(
      parse('<p>A claim needing support<a href="#fn1">[1]</a> follows here.</p>'),
    )
    expect(blocks[0]?.text).toBe('A claim needing support follows here.')
  })

  it('keeps a real link\'s text (not a footnote marker)', () => {
    const blocks = extractBlocks(parse('<p>See <a href="https://example.com">the source</a>.</p>'))
    expect(blocks[0]?.text).toBe('See the source.')
  })

  it('strips an embedded caption span from a heading', () => {
    const blocks = extractBlocks(
      parse('<h2><span class="caption">A photo caption.</span><br/>CHAPTER TWO.</h2>'),
    )
    expect(blocks[0]?.text).toBe('CHAPTER TWO.')
  })

  it('returns an empty array for a document with no body content', () => {
    expect(extractBlocks(parse(''))).toEqual([])
  })
})
