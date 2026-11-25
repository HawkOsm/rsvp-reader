import { BOOKS_DIR, NOTES_DIR } from './files'
import type { StoreUsage, Transport } from './transport'

// The shared store on Google Drive (docs/architecture/sync.md, section 6):
// the files of `Transport` kept in a folder of the user's Drive, through the
// Drive v3 REST API with plain `fetch`. The app is only allowed files it made
// itself (the `drive.file` scope), so it sees its own folder and nothing else
// of the user's. Inside the root folder live three subfolders ("Books",
// "Notes", "App data"); Drive identifies items by id, not name, so the ids
// are learned from `list` and kept.

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
/** The folder's name in the user's Drive, where they can see it. */
export const FOLDER_NAME = 'RSVP Reader'
const FOLDER_TYPE = 'application/vnd.google-apps.folder'

const SUBFOLDERS = {
  books: 'Books',
  notes: 'Notes',
  appData: 'App data',
} as const
type SubfolderKey = keyof typeof SUBFOLDERS

const PREFIXES: Record<SubfolderKey, string> = {
  books: BOOKS_DIR,
  notes: NOTES_DIR,
  appData: '',
}

interface DriveItem {
  id: string
  name: string
  mimeType?: string
  size?: string
  md5Checksum?: string
}

function splitName(name: string): { folder: SubfolderKey; shortName: string } {
  if (name.startsWith(BOOKS_DIR)) {
    return { folder: 'books', shortName: name.slice(BOOKS_DIR.length) }
  }
  if (name.startsWith(NOTES_DIR)) {
    return { folder: 'notes', shortName: name.slice(NOTES_DIR.length) }
  }
  return { folder: 'appData', shortName: name }
}

/** Where the transport gets its access token (`Platform.syncAuth`). */
export interface TokenSource {
  getToken(): Promise<string | null>
  renewToken(): Promise<string | null>
}

/** There is no good token, and getting one needs the user. Nothing was lost:
 * changes not sent yet stay queued. */
export class NeedsReconnectError extends Error {
  constructor() {
    super('Google Drive needs reconnecting.')
    this.name = 'NeedsReconnectError'
  }
}

/** The user's Drive has no room left. */
export class DriveFullError extends Error {
  constructor() {
    super('Google Drive is full.')
    this.name = 'DriveFullError'
  }
}

/** Drive couldn't be reached at all. */
export class OfflineError extends Error {
  constructor() {
    super('Google Drive couldn’t be reached.')
    this.name = 'OfflineError'
  }
}

/** Drive answered with an error that retrying didn't fix. */
export class DriveError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(`Google Drive: ${status} ${message}`)
    this.name = 'DriveError'
    this.status = status
  }
}

/** How long to wait before retry `attempt` (0 for the first retry): up to a
 * doubling ceiling, chosen at random ("full jitter"), so devices that failed
 * together don't all retry together. */
export function backoffDelay(attempt: number, random: number): number {
  const ceiling = Math.min(32_000, 500 * 2 ** attempt)
  return Math.round(random * ceiling)
}

export interface DriveOptions {
  auth: TokenSource
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  /** Tries per request, the first included. */
  attempts?: number
  /** The folder's name, if not `FOLDER_NAME`: for trying sync against a
   * real Drive without touching the real folder. */
  folderName?: string
}

export class DriveTransport implements Transport {
  private ids: Map<string, string> | null = null
  private sizes = new Map<string, number>()
  private versions = new Map<string, string>()
  /** The subfolder ids, as of the last `list`. */
  private folders: Record<SubfolderKey, string> = { books: '', notes: '', appData: '' }
  private readonly auth: TokenSource
  private readonly fetch: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly random: () => number
  private readonly attempts: number
  private readonly folderName: string

  constructor(options: DriveOptions) {
    this.auth = options.auth
    // Bound, because a bare `fetch` called as a method throws in browsers.
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.random = options.random ?? Math.random
    this.attempts = options.attempts ?? 6
    this.folderName = options.folderName ?? FOLDER_NAME
  }

  /** The id of the app's folder, made if there is none. Looked up on every
   * `list`, not kept for good: the user can delete or rename it, and then
   * the next run starts a new one. If two devices each made one at the same
   * moment, both settle on the older. Only folders this app made can match:
   * it can't see any other. */
  private async findFolder(): Promise<string> {
    const query = new URLSearchParams({
      q: `name='${this.folderName}' and mimeType='${FOLDER_TYPE}' and trashed=false`,
      fields: 'files(id)',
      orderBy: 'createdTime',
      pageSize: '1',
    })
    const oldest = async () => {
      const found = await this.request('GET', `${API}/files?${query}`)
      return ((await found.json()) as { files: { id: string }[] }).files[0]?.id
    }
    const found = await oldest()
    if (found) return found
    const metadata = JSON.stringify({ name: this.folderName, mimeType: FOLDER_TYPE })
    const made = await this.request('POST', `${API}/files?fields=id`, metadata, 'application/json')
    const mine = ((await made.json()) as { id: string }).id
    // Another device may have made one in that moment. Look again before
    // anything is put in this one: what goes into the newer of two is never
    // seen by a device that settled on the older.
    const settled = (await oldest()) ?? mine
    if (settled !== mine && (await this.listChildren(mine)).length === 0) {
      await this.request('DELETE', `${API}/files/${mine}`)
    }
    return settled
  }

  private async createSubfolder(name: string, parent: string): Promise<string> {
    const metadata = JSON.stringify({ name, mimeType: FOLDER_TYPE, parents: [parent] })
    const made = await this.request('POST', `${API}/files?fields=id`, metadata, 'application/json')
    return ((await made.json()) as { id: string }).id
  }

  private async listChildren(folderId: string): Promise<DriveItem[]> {
    const items: DriveItem[] = []
    let pageToken = ''
    do {
      const query = new URLSearchParams({
        // Not ones the user put in the bin: to them, those are gone.
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken,files(id,name,mimeType,size,md5Checksum)',
        pageSize: '1000',
        // If two devices ever create the same name at once, all devices
        // settle on the same, older, item.
        orderBy: 'createdTime',
      })
      if (pageToken) query.set('pageToken', pageToken)
      const response = await this.request('GET', `${API}/files?${query}`)
      const page = (await response.json()) as {
        files: DriveItem[]
        nextPageToken?: string
      }
      items.push(...page.files)
      pageToken = page.nextPageToken ?? ''
    } while (pageToken)
    return items
  }

  async list(): Promise<string[]> {
    const root = await this.findFolder()
    const rootChildren = await this.listChildren(root)
    const foundSubfolders: Partial<Record<SubfolderKey, string>> = {}
    const legacyFiles: DriveItem[] = []
    for (const item of rootChildren) {
      if (item.mimeType === FOLDER_TYPE) {
        for (const key of Object.keys(SUBFOLDERS) as SubfolderKey[]) {
          if (item.name === SUBFOLDERS[key] && !foundSubfolders[key]) {
            foundSubfolders[key] = item.id
          }
        }
      } else {
        legacyFiles.push(item)
      }
    }

    const folders: Record<SubfolderKey, string> = {
      books: foundSubfolders.books ?? (await this.createSubfolder(SUBFOLDERS.books, root)),
      notes: foundSubfolders.notes ?? (await this.createSubfolder(SUBFOLDERS.notes, root)),
      appData: foundSubfolders.appData ?? (await this.createSubfolder(SUBFOLDERS.appData, root)),
    }

    const ids = new Map<string, string>()
    const sizes = new Map<string, number>()
    const versions = new Map<string, string>()
    for (const key of ['appData', 'books', 'notes'] as const) {
      if (!foundSubfolders[key]) continue
      const prefix = PREFIXES[key]
      for (const item of await this.listChildren(folders[key])) {
        if (item.mimeType === FOLDER_TYPE) continue
        const fullName = `${prefix}${item.name}`
        if (ids.has(fullName)) continue
        ids.set(fullName, item.id)
        sizes.set(fullName, Number(item.size ?? 0))
        if (item.md5Checksum) versions.set(fullName, item.md5Checksum)
      }
    }

    // Legacy flat files directly under the root folder belong in App data
    // unless App data already holds a file with that name.
    for (const item of legacyFiles) {
      if (ids.has(item.name)) continue
      const params = new URLSearchParams({
        addParents: folders.appData,
        removeParents: root,
      })
      const moved = await this.request('PATCH', `${API}/files/${item.id}?${params}`)
      if (moved.status === 404) continue
      ids.set(item.name, item.id)
      sizes.set(item.name, Number(item.size ?? 0))
      if (item.md5Checksum) versions.set(item.name, item.md5Checksum)
    }

    this.folders = folders
    this.ids = ids
    this.sizes = sizes
    this.versions = versions
    return [...ids.keys()]
  }

  versionOf(name: string): string | undefined {
    return this.versions.get(name)
  }

  async read(name: string): Promise<string | null> {
    const id = await this.idOf(name)
    if (!id) return null
    const response = await this.request('GET', `${API}/files/${id}?alt=media`)
    if (response.status === 404) {
      this.ids?.delete(name)
      this.versions.delete(name)
      return null
    }
    return response.text()
  }

  async readBlob(name: string): Promise<Blob | null> {
    const id = await this.idOf(name)
    if (!id) return null
    const response = await this.request('GET', `${API}/files/${id}?alt=media`)
    if (response.status === 404) {
      this.ids?.delete(name)
      this.versions.delete(name)
      return null
    }
    return response.blob()
  }

  async write(name: string, data: string | Blob): Promise<void> {
    await this.writeFile(name, data)
    // Forget the old md5Checksum: the next `list()` will fetch Drive's new one.
    this.versions.delete(name)
  }

  private async writeFile(name: string, data: string | Blob): Promise<void> {
    const type =
      typeof data === 'string' ? 'application/json' : data.type || 'application/octet-stream'
    const id = await this.idOf(name)
    if (id) {
      const url = `${UPLOAD}/files/${id}?uploadType=media`
      const response = await this.request('PATCH', url, data, type)
      if (response.status !== 404) return
      this.ids?.delete(name) // deleted on Drive since it was listed: make it again
    }
    const { folder, shortName } = splitName(name)
    const parent = this.folders[folder]
    if (typeof data !== 'string') {
      // Bytes don't fit a text multipart body: make the file, then fill it.
      const metadata = JSON.stringify({ name: shortName, parents: [parent] })
      const made = await this.request(
        'POST',
        `${API}/files?fields=id`,
        metadata,
        'application/json',
      )
      const created = (await made.json()) as { id: string }
      this.ids?.set(name, created.id)
      await this.request('PATCH', `${UPLOAD}/files/${created.id}?uploadType=media`, data, type)
      return
    }
    const boundary = `rsvp-${Math.floor(this.random() * 1e12)}`
    const metadata = JSON.stringify({ name: shortName, parents: [parent] })
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      data,
      `--${boundary}--`,
      '',
    ].join('\r\n')
    const url = `${UPLOAD}/files?uploadType=multipart&fields=id`
    const response = await this.request(
      'POST',
      url,
      body,
      `multipart/related; boundary=${boundary}`,
    )
    const created = (await response.json()) as { id: string }
    this.ids?.set(name, created.id)
  }

  async delete(name: string): Promise<void> {
    const id = await this.idOf(name)
    this.versions.delete(name)
    if (!id) return
    // A 404 means another run deleted it already: the same result.
    await this.request('DELETE', `${API}/files/${id}`)
    this.ids?.delete(name)
  }

  async usage(): Promise<StoreUsage> {
    await this.list()
    const used = [...this.sizes.values()].reduce((sum, size) => sum + size, 0)
    const response = await this.request('GET', `${API}/about?fields=storageQuota`)
    const { storageQuota } = (await response.json()) as {
      storageQuota?: { limit?: string; usage?: string }
    }
    // No limit is given for an account with unlimited storage.
    const free =
      storageQuota?.limit === undefined
        ? null
        : Math.max(0, Number(storageQuota.limit) - Number(storageQuota.usage ?? 0))
    return { used, free }
  }

  private async idOf(name: string): Promise<string | undefined> {
    if (!this.ids) await this.list()
    return this.ids?.get(name)
  }

  /** One request, retried with backoff on rate limits, server errors and a
   * lost connection. A refused token is renewed once. A 404 is returned for
   * the caller to handle; any other failure throws. */
  private async request(
    method: string,
    url: string,
    body?: string | Blob,
    contentType?: string,
  ): Promise<Response> {
    let renewed = false
    for (let attempt = 0; ; attempt++) {
      const retry = async () => {
        if (attempt + 1 >= this.attempts) return false
        await this.sleep(backoffDelay(attempt, this.random()))
        return true
      }

      const token = await this.auth.getToken()
      if (!token) throw new NeedsReconnectError()
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
      if (contentType) headers['Content-Type'] = contentType

      let response: Response
      try {
        response = await this.fetch(url, { method, headers, body })
      } catch {
        // fetch throws only when there was no answer at all.
        if (await retry()) continue
        throw new OfflineError()
      }
      if (response.ok || response.status === 404) return response

      if (response.status === 401) {
        if (!renewed && (await this.auth.renewToken())) {
          renewed = true
          attempt-- // a renewed token is a fresh start, not a failure
          continue
        }
        throw new NeedsReconnectError()
      }
      const reason = response.status === 403 ? await errorReason(response) : ''
      if (reason === 'storageQuotaExceeded') throw new DriveFullError()
      const transient =
        response.status === 429 ||
        response.status >= 500 ||
        reason === 'rateLimitExceeded' ||
        reason === 'userRateLimitExceeded'
      if (transient && (await retry())) continue
      throw new DriveError(response.status, REASONS[reason] ?? (reason || response.statusText))
    }
  }
}

/** What to tell the user for the errors that only the app's owner can fix,
 * in the Google Cloud project behind the client ID. */
const REASONS: Record<string, string> = {
  accessNotConfigured:
    'the Google Drive API isn’t enabled for this app’s Google Cloud project (accessNotConfigured)',
}

/** The `reason` Drive gives for an error, e.g. `storageQuotaExceeded`. */
async function errorReason(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { errors?: { reason?: string }[] } }
    return body.error?.errors?.[0]?.reason ?? ''
  } catch {
    return '' // not JSON: no reason given
  }
}
