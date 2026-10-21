/** Lower-cased extension without the dot; '' when the name has none. */
export function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : ''
}
