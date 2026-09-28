/** Resolve an EPUB manifest href (relative to the OPF file's own directory)
 * to a path inside the zip archive, handling `../`, `./`, URL-encoding and
 * a trailing `#fragment`. */
export function resolveEpubPath(opfDir: string, href: string): string {
  const withoutFragment = href.split('#')[0] ?? href
  const decoded = decodeURIComponent(withoutFragment)

  if (decoded.startsWith('/')) return decoded.slice(1)

  const stack = opfDir.split('/').filter(Boolean)
  for (const part of decoded.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

/** The directory portion of a zip path, e.g. "OEBPS/content.opf" -> "OEBPS". */
export function dirname(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx >= 0 ? path.slice(0, idx) : ''
}
