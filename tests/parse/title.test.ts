import { describe, expect, it } from 'vitest'
import { chooseTitle, titleFromFileName } from '../../src/parse/title'

// Mirrors text_extract.py's suggest_title() rules exactly.
describe('chooseTitle', () => {
  it('uses a plausible document title', () => {
    expect(chooseTitle('The Strange Case of Dr Jekyll', 'book.pdf')).toBe(
      'The Strange Case of Dr Jekyll',
    )
  })

  it('falls back to the file name when there is no title', () => {
    expect(chooseTitle(undefined, 'book.pdf')).toBe('book')
    expect(chooseTitle('', 'my-book.pdf')).toBe('my-book')
  })

  it('falls back when the title starts with "untitled" (any case)', () => {
    expect(chooseTitle('Untitled Document 1', 'scan.pdf')).toBe('scan')
    expect(chooseTitle('untitled', 'scan.pdf')).toBe('scan')
  })

  it('falls back when the title is too short (<=2 chars) or too long (>=120)', () => {
    expect(chooseTitle('Ok', 'book.pdf')).toBe('book')
    expect(chooseTitle('A'.repeat(120), 'book.pdf')).toBe('book')
    expect(chooseTitle('A'.repeat(119), 'book.pdf')).toBe('A'.repeat(119))
  })

  it('falls back when the title looks like a path', () => {
    expect(chooseTitle('/home/user/books/book.pdf', 'book.pdf')).toBe('book')
    expect(chooseTitle('C:\\books\\book.pdf', 'book.pdf')).toBe('book')
  })

  it('trims surrounding whitespace before validating', () => {
    expect(chooseTitle('  Real Title  ', 'book.pdf')).toBe('Real Title')
  })
})

describe('titleFromFileName', () => {
  it('strips the extension', () => {
    expect(titleFromFileName('my-book.pdf')).toBe('my-book')
  })

  it('leaves a dotfile-style name with no extension alone', () => {
    expect(titleFromFileName('README')).toBe('README')
  })
})
