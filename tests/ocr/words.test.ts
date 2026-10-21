import { describe, expect, it } from 'vitest'
import { MIN_WORD_CONFIDENCE, ocrToLines, type OcrBlocks } from '../../src/ocr/words'

const word = (text: string, x0: number, y0: number, confidence = 90) => ({
  text,
  confidence,
  bbox: { x0, y0, x1: x0 + 60, y1: y0 + 30 },
})

describe('ocrToLines', () => {
  it('turns pixel boxes back into page points using the scale', () => {
    const page: OcrBlocks = {
      blocks: [{ paragraphs: [{ lines: [{ words: [word('Hello', 300, 600)] }] }] }],
    }
    const [line] = ocrToLines(page, 3)
    expect(line?.words[0]).toEqual({ text: 'Hello', x0: 100, y0: 200, x1: 120, y1: 210 })
    expect(line?.baseline).toBe(210)
  })

  it('groups lines by layout block, however Tesseract splits paragraphs', () => {
    const page: OcrBlocks = {
      blocks: [
        {
          paragraphs: [
            { lines: [{ words: [word('one', 0, 0)] }] },
            { lines: [{ words: [word('two', 0, 40)] }] }, // a second "paragraph", same block
          ],
        },
        { paragraphs: [{ lines: [{ words: [word('three', 0, 200)] }] }] },
      ],
    }
    expect(ocrToLines(page, 1).map((l) => [l.words[0]?.text, l.block])).toEqual([
      ['one', 0],
      ['two', 0],
      ['three', 1],
    ])
  })

  it('drops blank words and low-confidence specks', () => {
    const page: OcrBlocks = {
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                {
                  words: [
                    word('real', 0, 0),
                    word('  ', 70, 0),
                    word('l', 140, 0, MIN_WORD_CONFIDENCE - 1),
                    word('word', 210, 0, MIN_WORD_CONFIDENCE),
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    expect(ocrToLines(page, 1)[0]?.words.map((w) => w.text)).toEqual(['real', 'word'])
  })

  it('leaves out a line that has no words left', () => {
    const page: OcrBlocks = {
      blocks: [{ paragraphs: [{ lines: [{ words: [word('x', 0, 0, 5)] }, { words: [word('kept', 0, 40)] }] }] }],
    }
    expect(ocrToLines(page, 1).map((l) => l.words[0]?.text)).toEqual(['kept'])
  })

  it('trims whitespace around a word', () => {
    const page: OcrBlocks = { blocks: [{ paragraphs: [{ lines: [{ words: [word(' padded ', 0, 0)] }] }] }] }
    expect(ocrToLines(page, 1)[0]?.words[0]?.text).toBe('padded')
  })

  it('copes with a page where nothing was found', () => {
    expect(ocrToLines({ blocks: null }, 1)).toEqual([])
    expect(ocrToLines({ blocks: [] }, 1)).toEqual([])
  })
})
