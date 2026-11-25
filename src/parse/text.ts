import { DEFAULT_PAGE } from '@/core/page-spec'
import { tokenizeText } from '@/core/tokenize'
import { ExtractionError } from './errors'
import { extensionOf } from './file-name'
import { stripMarkdown } from './markdown'
import { titleFromFileName } from './title'
import type { ParseResult } from './types'

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown'])

/** Bytes no text file holds: control codes other than tab, line feed, form
 * feed and carriage return, and the five bytes windows-1254 gives no
 * character to. */
const NOT_TEXT = new Set([
  ...Array.from({ length: 32 }, (_, byte) => byte).filter((b) => ![9, 10, 12, 13].includes(b)),
  0x7f,
  0x81,
  0x8d,
  0x8e,
  0x8f,
  0x90,
  0x9d,
  0x9e,
])
/** More of them than this share of the file, and it is not text. Old text
 * files do carry a stray one (a DOS end-of-file mark, say); a picture or an
 * archive is about a tenth such bytes. */
const NOT_TEXT_SHARE = 0.01

/** Whether bytes that are not UTF-8 could be text in an old one-byte
 * encoding, and not a picture, an archive or some other kind of file. */
export function couldBeText(bytes: Uint8Array): boolean {
  let strange = 0
  for (const byte of bytes) if (NOT_TEXT.has(byte)) strange++
  return strange <= bytes.length * NOT_TEXT_SHARE
}

/** UTF-8 first; old Turkish files saved as Windows-1254 fail UTF-8
 * decoding (it's not a superset), so that's the fallback — mirrors
 * text_extract.py's `_extract_plain()` (which tries utf-8, utf-8-sig, then
 * latin-1; windows-1254 is the closer match for the case the plan calls
 * out specifically: old Turkish text files). Every byte is a character in
 * that encoding, so anything at all would "decode": a file that is plainly
 * not text is refused first. (A JPEG with no extension once opened as a
 * book of "ÿØÿà JFIF ICC_PROFILE …".) */
async function decodeText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    if (!couldBeText(new Uint8Array(buffer))) {
      throw new ExtractionError(
        'This file is not text, a PDF or an EPUB, so it can’t be read as a book.',
      )
    }
    return new TextDecoder('windows-1254').decode(buffer)
  }
}

export async function parseTextFile(file: File): Promise<ParseResult> {
  let raw = await decodeText(file)
  if (MARKDOWN_EXTENSIONS.has(extensionOf(file.name))) {
    raw = stripMarkdown(raw)
  }

  const tokens = tokenizeText(raw)
  if (tokens.length === 0) {
    throw new ExtractionError('The document contains no readable words.')
  }

  return {
    title: titleFromFileName(file.name),
    tokens,
    formatId: 'text',
    layout: { kind: 'reflow' },
    page: DEFAULT_PAGE,
  }
}
