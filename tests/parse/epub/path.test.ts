import { describe, expect, it } from 'vitest'
import { dirname, resolveEpubPath } from '../../../src/parse/epub/path'

describe('resolveEpubPath', () => {
  it('resolves a plain sibling href', () => {
    expect(resolveEpubPath('OEBPS', 'chapter1.html')).toBe('OEBPS/chapter1.html')
  })

  it('resolves a nested relative href', () => {
    expect(resolveEpubPath('OEBPS', 'text/chapter1.html')).toBe('OEBPS/text/chapter1.html')
  })

  it('resolves ../ segments', () => {
    expect(resolveEpubPath('OEBPS/text', '../images/cover.jpg')).toBe('OEBPS/images/cover.jpg')
  })

  it('strips a trailing #fragment', () => {
    expect(resolveEpubPath('OEBPS', 'chapter1.html#section2')).toBe('OEBPS/chapter1.html')
  })

  it('decodes URL-encoded characters', () => {
    expect(resolveEpubPath('OEBPS', 'my%20book.html')).toBe('OEBPS/my book.html')
  })

  it('treats a leading slash as zip-root-relative', () => {
    expect(resolveEpubPath('OEBPS/text', '/OEBPS/other.html')).toBe('OEBPS/other.html')
  })

  it('resolves from a root (empty) directory', () => {
    expect(resolveEpubPath('', 'content.opf')).toBe('content.opf')
  })
})

describe('dirname', () => {
  it('returns the directory portion of a path', () => {
    expect(dirname('OEBPS/content.opf')).toBe('OEBPS')
    expect(dirname('OEBPS/text/content.opf')).toBe('OEBPS/text')
  })

  it('returns empty string for a root-level path', () => {
    expect(dirname('content.opf')).toBe('')
  })
})
