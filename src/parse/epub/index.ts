import JSZip from 'jszip'
import { tokenize } from '../../core/tokenize'
import type { Token } from '../../core/types'
import { ExtractionError } from '../errors'
import { titleFromFileName } from '../title'
import type { ParsedChapter, ParseResult, ProgressCallback } from '../types'
import { extractBlocks } from './content'
import { parseContainer, parseOpf } from './opf'
import { dirname, resolveEpubPath } from './path'

const CHAPTER_HEADING_TAGS = new Set(['h1', 'h2'])

export interface ParseEpubOptions {
  onProgress?: ProgressCallback
  signal?: AbortSignal
}

export async function parseEpub(file: File, options: ParseEpubOptions = {}): Promise<ParseResult> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch (error) {
    throw new ExtractionError(`Could not open EPUB: ${(error as Error).message}`)
  }

  const containerXml = await readZipText(zip, 'META-INF/container.xml')
  if (containerXml === undefined) {
    throw new ExtractionError('This EPUB has no META-INF/container.xml.')
  }
  const opfPath = parseContainer(containerXml)

  const opfXml = await readZipText(zip, opfPath)
  if (opfXml === undefined) {
    throw new ExtractionError(`This EPUB's container.xml points at a missing file: ${opfPath}`)
  }
  const opf = parseOpf(opfXml)
  if (opf.spineHrefs.length === 0) {
    throw new ExtractionError('This EPUB has no readable chapters in its spine.')
  }

  const opfDir = dirname(opfPath)
  const tokens: Token[] = []
  const chapters: ParsedChapter[] = []
  const parser = new DOMParser()

  for (let i = 0; i < opf.spineHrefs.length; i++) {
    if (options.signal?.aborted) throw new DOMException('Parsing cancelled', 'AbortError')

    const href = opf.spineHrefs[i] as string
    const zipPath = resolveEpubPath(opfDir, href)
    const html = await readZipText(zip, zipPath)
    if (html === undefined) continue // a spine entry pointing nowhere; skip rather than fail the book

    const doc = parser.parseFromString(html, 'text/html')
    for (const block of extractBlocks(doc)) {
      if (CHAPTER_HEADING_TAGS.has(block.tag)) {
        chapters.push({ title: block.text, startTokenIndex: tokens.length })
      }
      tokens.push(...tokenize(block.text))
    }

    options.onProgress?.({
      fraction: (i + 1) / opf.spineHrefs.length,
      message: `Chapter ${i + 1} of ${opf.spineHrefs.length}`,
    })
  }

  if (tokens.length === 0) {
    throw new ExtractionError('The document contains no readable words.')
  }

  return {
    title: opf.title === 'Untitled' ? titleFromFileName(file.name) : opf.title,
    author: opf.author,
    tokens,
    chapters,
  }
}

async function readZipText(zip: JSZip, path: string): Promise<string | undefined> {
  const entry = zip.file(path)
  if (!entry) return undefined
  return entry.async('text')
}
