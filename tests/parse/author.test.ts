import { describe, expect, it } from 'vitest'
import { cleanAuthor } from '@/parse/author'

describe('cleanAuthor', () => {
  it('keeps a real name, with its spaces tidied', () => {
    expect(cleanAuthor('Jane Austen')).toBe('Jane Austen')
    expect(cleanAuthor('  Lev   Tolstoy;\nLouise Maude ')).toBe('Lev Tolstoy; Louise Maude')
    expect(cleanAuthor('Austen, Jane')).toBe('Austen, Jane')
    expect(cleanAuthor('Лев Толстой')).toBe('Лев Толстой')
  })

  it('drops placeholders, whatever their case', () => {
    for (const raw of [
      'Unknown',
      'unknown author',
      'Anonymous',
      'N/A',
      'none',
      'Author',
      'calibre',
      'Unknown.',
    ])
      expect(cleanAuthor(raw)).toBeUndefined()
  })

  it('drops what is not a name', () => {
    for (const raw of [
      undefined,
      null,
      '',
      ' ',
      'X',
      '???',
      '1984',
      'C:\\\\Users\\\\me',
      'me@example.com',
      'https://example.com',
      'scan_0001.pdf',
      'a'.repeat(101),
    ])
      expect(cleanAuthor(raw)).toBeUndefined()
  })
})
