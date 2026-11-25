// The shared store that devices sync through (docs/architecture/sync.md,
// section 6): a flat folder of named files, text for sync's own and bytes for
// books. A folder in the user's Google Drive is the one used; `MemoryTransport` stands
// in for it in tests. Every file has exactly one writer, or (a book's files)
// is named by a hash of what it holds, so no write can conflict with another.

export interface Transport {
  /** The names of every file in the store. */
  list(): Promise<string[]>
  /** A file's contents, or `null` if there is no such file. */
  read(name: string): Promise<string | null>
  /** A file's bytes, or `null` if there is no such file. */
  readBlob(name: string): Promise<Blob | null>
  /** Create or replace a file. */
  write(name: string, data: string | Blob): Promise<void>
  /** Delete a file; deleting one that isn't there is not an error. */
  delete(name: string): Promise<void>
  /** How much the store holds, and how much room is left. */
  usage(): Promise<StoreUsage>
  /** A token that changes whenever the file's content changes, as of the
   * last `list()`; `undefined` when not known. */
  versionOf?(name: string): string | undefined
}

export interface StoreUsage {
  /** Bytes in this app's files. */
  used: number
  /** Bytes left for the user, or `null` with no limit. */
  free: number | null
}

function bytesDigest(bytes: Uint8Array): string {
  // Two independent 32-bit FNV-1a passes give a fast deterministic 64-bit
  // content token without async WebCrypto.
  let h1 = 0x811c9dc5
  let h2 = 0x9e3779b9
  for (const byte of bytes) {
    h1 = Math.imul(h1 ^ byte, 0x01000193)
    h2 = Math.imul(h2 ^ (byte + 1), 0x85ebca6b)
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}

/** A store held in memory. Several devices can share one to test sync. */
export class MemoryTransport implements Transport {
  readonly files = new Map<string, string>()
  readonly blobs = new Map<string, Blob>()
  private readonly blobVersions = new Map<string, string>()
  private readonly encoder = new TextEncoder()

  async list(): Promise<string[]> {
    return [...this.files.keys(), ...this.blobs.keys()]
  }

  async read(name: string): Promise<string | null> {
    return this.files.get(name) ?? (await this.blobs.get(name)?.text()) ?? null
  }

  async readBlob(name: string): Promise<Blob | null> {
    const text = this.files.get(name)
    return this.blobs.get(name) ?? (text === undefined ? null : new Blob([text]))
  }

  async write(name: string, data: string | Blob): Promise<void> {
    this.files.delete(name)
    this.blobs.delete(name)
    this.blobVersions.delete(name)
    if (typeof data === 'string') {
      this.files.set(name, data)
    } else {
      this.blobs.set(name, data)
      this.blobVersions.set(name, bytesDigest(new Uint8Array(await data.arrayBuffer())))
    }
  }

  async delete(name: string): Promise<void> {
    this.files.delete(name)
    this.blobs.delete(name)
    this.blobVersions.delete(name)
  }

  versionOf(name: string): string | undefined {
    const text = this.files.get(name)
    if (text !== undefined) return bytesDigest(this.encoder.encode(text))
    if (this.blobs.has(name)) return this.blobVersions.get(name)
    return undefined
  }

  async usage(): Promise<StoreUsage> {
    let used = 0
    for (const text of this.files.values()) used += new Blob([text]).size
    for (const blob of this.blobs.values()) used += blob.size
    return { used, free: null }
  }
}
