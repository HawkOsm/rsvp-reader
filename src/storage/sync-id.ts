import type { ContentLayout, Token } from '@/core/types'

// A book's sync id: the same on every device that has the same book. A paged
// book (a PDF) is hashed from its file, which it keeps. A reflowed book keeps
// only its words, so it is hashed from those, both at import and when an
// older book is given an id later; hashing its file at import would give a
// different id from the one an older copy can be given.

/** The book's sync id, from its file if it's paged, else from its words. */
export async function syncIdOf(
  layout: ContentLayout,
  source: { file?: Blob; tokens?: Token[] },
): Promise<string | undefined> {
  if (layout.kind === 'paged') {
    return source.file && sha256(await source.file.arrayBuffer())
  }
  if (!source.tokens) return undefined
  const text = source.tokens
    .map((t) => t.text)
    .join(' ')
    .normalize('NFC')
  return sha256(new TextEncoder().encode(text))
}

async function sha256(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
