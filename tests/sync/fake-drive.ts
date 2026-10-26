// An in-memory Google Drive, answering the few Drive v3 REST calls that
// `DriveTransport` makes, so sync can be tested without the network. Only
// `appDataFolder` exists. `failNext` makes the next requests fail, to test
// retries and errors.

interface DriveFile {
  id: string
  name: string
  data: string
}

export class FakeDrive {
  readonly files: DriveFile[] = []
  /** Bearer tokens the fake accepts. */
  readonly tokens = new Set(['good'])
  readonly requests: string[] = []
  /** Files per page of a listing, small so paging is exercised. */
  pageSize = 2
  private failures: { status: number; reason?: string }[] = []
  private nextId = 1

  /** Answer the next `count` requests with this error instead. `status: 0`
   * is no answer at all (offline). */
  failNext(status: number, count = 1, reason?: string) {
    for (let i = 0; i < count; i++) this.failures.push({ status, reason })
  }

  byName(name: string): string | undefined {
    return this.files.find((f) => f.name === name)?.data
  }

  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input))
    const method = init.method ?? 'GET'
    this.requests.push(`${method} ${url.pathname}${url.search}`)

    const failure = this.failures.shift()
    if (failure?.status === 0) throw new TypeError('Failed to fetch')
    if (failure) {
      const errors = failure.reason ? [{ reason: failure.reason }] : []
      return json({ error: { code: failure.status, errors } }, failure.status)
    }
    const auth = (init.headers as Record<string, string>)?.Authorization ?? ''
    if (!this.tokens.has(auth.replace('Bearer ', ''))) return json({ error: { code: 401 } }, 401)

    const path = url.pathname
    if (method === 'GET' && path === '/drive/v3/files') {
      if (url.searchParams.get('spaces') !== 'appDataFolder') return json({}, 400)
      const start = Number(url.searchParams.get('pageToken') ?? 0)
      const page = this.files.slice(start, start + this.pageSize)
      const more = start + this.pageSize < this.files.length
      return json({
        files: page.map(({ id, name }) => ({ id, name })),
        ...(more && { nextPageToken: String(start + this.pageSize) }),
      })
    }
    const fileMatch = /^\/(?:upload\/)?drive\/v3\/files\/([^/]+)$/.exec(path)
    if (fileMatch) {
      const file = this.files.find((f) => f.id === fileMatch[1])
      if (!file) return json({ error: { code: 404 } }, 404)
      if (method === 'GET' && url.searchParams.get('alt') === 'media') {
        return new Response(file.data)
      }
      if (method === 'PATCH' && url.searchParams.get('uploadType') === 'media') {
        file.data = String(init.body)
        return json({ id: file.id })
      }
    }
    if (method === 'POST' && path === '/upload/drive/v3/files') {
      const type = (init.headers as Record<string, string>)['Content-Type'] ?? ''
      const boundary = /boundary=(.+)$/.exec(type)?.[1]
      const parts = String(init.body)
        .split(`--${boundary}`)
        .slice(1, -1)
        .map((part) => part.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''))
      const metadata = JSON.parse(parts[0]!) as { name: string; parents: string[] }
      if (metadata.parents[0] !== 'appDataFolder') return json({}, 400)
      const file = { id: `f${this.nextId++}`, name: metadata.name, data: parts[1]! }
      this.files.push(file)
      return json({ id: file.id })
    }
    return json({ error: { code: 400, message: `unexpected ${method} ${path}` } }, 400)
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
