import { describe, expect, it } from 'vitest'
import { itemsToLines } from '../../../src/parse/pdf/lines'
import type { PdfTextItem } from '../../../src/parse/pdf/types'

function item(
  str: string,
  x: number,
  width: number,
  hasEOL: boolean,
  y = 700,
  fontSize = 12,
): PdfTextItem {
  return { str, transform: [fontSize, 0, 0, fontSize, x, y], width, height: fontSize, hasEOL }
}

describe('itemsToLines', () => {
  it('splits one item containing a whole line into its words', () => {
    const lines = itemsToLines([item('Hello world.', 0, 70, true)], 0)
    expect(lines).toHaveLength(1)
    expect(lines[0]?.words.map((w) => w.text)).toEqual(['Hello', 'world.'])
  })

  it('estimates each word bbox proportionally to its position in the item', () => {
    const lines = itemsToLines([item('ab cd', 100, 40, true)], 0)
    const [ab, cd] = lines[0]?.words ?? []
    expect(ab?.bbox[0]).toBeCloseTo(100, 5)
    expect(ab?.bbox[2]).toBeCloseTo(116, 5)
    expect(cd?.bbox[0]).toBeCloseTo(124, 5)
    expect(cd?.bbox[2]).toBeCloseTo(140, 5)
  })

  it('keeps two items on a line as separate words when there is a real gap', () => {
    const lines = itemsToLines(
      [item('Hello', 0, 30, false), item('world.', 40, 35, true)],
      0,
    )
    expect(lines[0]?.words.map((w) => w.text)).toEqual(['Hello', 'world.'])
  })

  it('glues two adjacent items with no gap into one word (mid-word style change)', () => {
    const lines = itemsToLines([item('wor', 0, 18, false), item('ld.', 18, 21, true)], 0)
    expect(lines[0]?.words.map((w) => w.text)).toEqual(['world.'])
    // The glued word's bbox spans both fragments.
    expect(lines[0]?.words[0]?.bbox[0]).toBeCloseTo(0, 5)
    expect(lines[0]?.words[0]?.bbox[2]).toBeCloseTo(39, 5)
  })

  it('does not glue across a real space even with zero measured gap', () => {
    const lines = itemsToLines([item('wor ', 0, 24, false), item('ld.', 24, 21, true)], 0)
    expect(lines[0]?.words.map((w) => w.text)).toEqual(['wor', 'ld.'])
  })

  it('starts a new line on hasEOL and ignores a blank-line item', () => {
    const lines = itemsToLines(
      [
        item('First line.', 0, 60, true),
        item('', 0, 0, true), // a blank line: no words, just an EOL
        item('Second line.', 0, 65, true, 680),
      ],
      0,
    )
    expect(lines).toHaveLength(2)
    expect(lines[0]?.words.map((w) => w.text)).toEqual(['First', 'line.'])
    expect(lines[1]?.words.map((w) => w.text)).toEqual(['Second', 'line.'])
  })

  it('tags every word with the given page number', () => {
    const lines = itemsToLines([item('word', 0, 20, true)], 3)
    expect(lines[0]?.words[0]?.page).toBe(3)
  })
})
