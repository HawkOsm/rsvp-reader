import { tokenizeText } from '../core/tokenize'
import { ExtractionError } from './errors'
import { stripMarkdown } from './markdown'
import { titleFromFileName } from './title'
import type { ParseResult } from './types'

export const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'text', 'rst', 'org'])
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown'])

function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : ''
}

/** UTF-8 first; old Turkish files saved as Windows-1254 fail UTF-8
 * decoding (it's not a superset), so that's the fallback — mirrors
 * text_extract.py's `_extract_plain()` (which tries utf-8, utf-8-sig, then
 * latin-1; windows-1254 is the closer match for the case the plan calls
 * out specifically: old Turkish text files). */
async function decodeText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
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

  return { title: titleFromFileName(file.name), tokens }
}
