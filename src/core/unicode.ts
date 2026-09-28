/** Codepoint-aware helpers, so a stray astral character (e.g. an emoji)
 * indexes the same way it would in Python — where `len()`/indexing counts
 * codepoints, not UTF-16 code units like plain JS string indexing does. */

export function codePoints(s: string): string[] {
  return Array.from(s)
}

/** Python's `str.strip(chars)`: drop leading/trailing codepoints in `chars`. */
export function stripChars(s: string, chars: string): string {
  const set = new Set(codePoints(chars))
  const cps = codePoints(s)
  let start = 0
  let end = cps.length
  while (start < end && set.has(cps[start] as string)) start++
  while (end > start && set.has(cps[end - 1] as string)) end--
  return cps.slice(start, end).join('')
}

/** Python's `str.rstrip(chars)`. */
export function rstripChars(s: string, chars: string): string {
  const set = new Set(codePoints(chars))
  const cps = codePoints(s)
  let end = cps.length
  while (end > 0 && set.has(cps[end - 1] as string)) end--
  return cps.slice(0, end).join('')
}

/** Python's `str.isalnum()` for a single codepoint. */
export function isAlnum(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch)
}
