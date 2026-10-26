/** Names a book's metadata gives when it has no real author. */
const PLACEHOLDERS = new Set([
  'unknown',
  'unknown author',
  'anonymous',
  'anon',
  'author',
  'n/a',
  'na',
  'none',
  'various',
  'calibre',
  'administrator',
  'admin',
  'user',
])

/** The author a book's metadata names, if it is one worth showing: spaces
 * tidied, and nothing that is a placeholder, a path, a file name, an
 * address, or not a name at all. A book without a clean one shows none. */
export function cleanAuthor(raw: string | undefined | null): string | undefined {
  const name = raw?.replace(/\s+/g, ' ').trim() ?? ''
  if (name.length < 2 || name.length > 100) return undefined
  if (!/\p{L}/u.test(name)) return undefined
  if (PLACEHOLDERS.has(name.toLowerCase().replace(/[.\s]+$/, ''))) return undefined
  if (/[\\/@]|https?:|www\.|\.(epub|pdf|txt|docx?|md)$/i.test(name)) return undefined
  return name
}
