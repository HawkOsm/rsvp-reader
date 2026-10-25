// The shared store that devices sync through (docs/architecture/sync.md,
// section 6): a flat folder of named text files. Google Drive's app folder
// is the planned one; `MemoryTransport` stands in for it in tests. Every
// file has exactly one writer, so no write can conflict with another.

export interface Transport {
  /** The names of every file in the store. */
  list(): Promise<string[]>
  /** A file's contents, or `null` if there is no such file. */
  read(name: string): Promise<string | null>
  /** Create or replace a file. */
  write(name: string, data: string): Promise<void>
}

/** A store held in memory. Several devices can share one to test sync. */
export class MemoryTransport implements Transport {
  readonly files = new Map<string, string>()

  async list(): Promise<string[]> {
    return [...this.files.keys()]
  }

  async read(name: string): Promise<string | null> {
    return this.files.get(name) ?? null
  }

  async write(name: string, data: string): Promise<void> {
    this.files.set(name, data)
  }
}
