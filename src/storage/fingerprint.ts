import { CACHE_VERSION } from './schema'

/** Mirrors db.py's `fingerprint_of()`, but from a `File`'s own metadata —
 * there's no file path on web to `stat()`. */
export function fingerprintOf(file: File): string {
  return `v${CACHE_VERSION}:${file.size}:${file.lastModified}`
}
