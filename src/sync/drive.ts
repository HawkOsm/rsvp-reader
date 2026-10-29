import type { StoreUsage, Transport } from './transport'

// The shared store on Google Drive (docs/architecture/sync.md, section 6):
// the files of `Transport` kept in the app's hidden `appDataFolder`, through
// the Drive v3 REST API with plain `fetch`. Drive identifies files by id, not
// name, so the ids are learned from `list` and kept.

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER = 'appDataFolder'

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
}

export class DriveTransport implements Transport {
  private ids: Map<string, string> | null = null
  private sizes = new Map<string, number>()
  private readonly auth: TokenSource
  private readonly fetch: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly random: () => number
  private readonly attempts: number

  constructor(options: DriveOptions) {
    this.auth = options.auth
    // Bound, because a bare `fetch` called as a method throws in browsers.
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.random = options.random ?? Math.random
    this.attempts = options.attempts ?? 6
  }

  async list(): Promise<string[]> {
    const ids = new Map<string, string>()
    const sizes = new Map<string, number>()
    let pageToken = ''
    do {
      const query = new URLSearchParams({
        spaces: FOLDER,
        fields: 'nextPageToken,files(id,name,size)',
        pageSize: '1000',
        // If two devices ever create the same name at once (meta.json), all
        // devices settle on the same, older, file.
        orderBy: 'createdTime',
      })
      if (pageToken) query.set('pageToken', pageToken)
      const response = await this.request('GET', `${API}/files?${query}`)
      const page = (await response.json()) as {
        files: { id: string; name: string; size?: string }[]
        nextPageToken?: string
      }
      for (const file of page.files) {
        if (ids.has(file.name)) continue
        ids.set(file.name, file.id)
        sizes.set(file.name, Number(file.size ?? 0))
      }
      pageToken = page.nextPageToken ?? ''
    } while (pageToken)
    this.ids = ids
    this.sizes = sizes
    return [...ids.keys()]
  }

  async read(name: string): Promise<string | null> {
    const id = await this.idOf(name)
    if (!id) return null
    const response = await this.request('GET', `${API}/files/${id}?alt=media`)
    if (response.status === 404) {
      this.ids?.delete(name)
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
      return null
    }
    return response.blob()
  }

  async write(name: string, data: string | Blob): Promise<void> {
    const type = typeof data === 'string' ? 'application/json' : 'application/octet-stream'
    const id = await this.idOf(name)
    if (id) {
      const url = `${UPLOAD}/files/${id}?uploadType=media`
      const response = await this.request('PATCH', url, data, type)
      if (response.status !== 404) return
      this.ids?.delete(name) // deleted on Drive since it was listed: make it again
    }
    if (typeof data !== 'string') {
      // Bytes don't fit a text multipart body: make the file, then fill it.
      const metadata = JSON.stringify({ name, parents: [FOLDER] })
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
    const metadata = JSON.stringify({ name, parents: [FOLDER] })
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
