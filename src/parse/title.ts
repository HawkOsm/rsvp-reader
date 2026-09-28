export function titleFromFileName(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  return idx > 0 ? fileName.slice(0, idx) : fileName
}

/** Mirrors text_extract.py's suggest_title(): trust a document's own title
 * metadata only if it looks like real prose, not a path, a raw file name,
 * or an "Untitled" placeholder some PDF producers leave. */
export function chooseTitle(candidate: string | undefined | null, fileName: string): string {
  const trimmed = candidate?.trim() ?? ''
  if (
    trimmed.length > 2 &&
    trimmed.length < 120 &&
    !trimmed.toLowerCase().startsWith('untitled') &&
    !trimmed.includes('/') &&
    !trimmed.includes('\\')
  ) {
    return trimmed
  }
  return titleFromFileName(fileName)
}
