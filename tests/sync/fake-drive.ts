// An in-memory Google Drive, answering the few Drive v3 REST calls that
// `DriveTransport` makes, so sync can be tested without the network. As with
// the `drive.file` scope, the app sees only what it made: folders it created
// and the files in them. `failNext` makes the next requests fail, to test
// retries and errors.

interface DriveFile {
  id: string
  name: string
  data: string | Blob
  /** The folder it is in. */
  parent: string
  /** The user put it in the bin. */
  trashed?: boolean
}

interface DriveFolder {
  id: string
  name: string
  parent?: string
  trashed?: boolean
}

const FOLDER_TYPE = 'application/vnd.google-apps.folder'

export class FakeDrive {
  readonly files: DriveFile[] = []
  /** The folders the app made, oldest first. */
  readonly folders: DriveFolder[] = []
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

  /** Room left on the fake Drive, or `null` for no limit. */
  free: number | null = null

  /** The folder a new file names as its parent, if the app made it. */
  private folderOf(parents: string[] | undefined): string | undefined {
    return this.folders.find((f) => f.id === parents?.[0] && !f.trashed)?.id
  }

  folderId(name: string, parent?: string): string | undefined {
    return this.folders.find(
      (f) => f.name === name && !f.trashed && (parent === undefined || f.parent === parent),
    )?.id
  }

  byName(name: string): string | undefined {
    const data = this.files.find((f) => f.name === name)?.data
    return typeof data === 'string' ? data : undefined
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
      // The hidden app folder is no longer used; asking for it is a bug.
      if (url.searchParams.has('spaces')) return json({}, 400)
      const q = url.searchParams.get('q') ?? ''
      if (q.includes(`mimeType='${FOLDER_TYPE}'`)) {
        const name = /name='([^']*)'/.exec(q)?.[1]
        const found = this.folders.filter((f) => f.name === name && !f.trashed)
        return json({ files: found.map(({ id }) => ({ id })) })
      }
      const parent = /^'([^']+)' in parents and trashed=false$/.exec(q)?.[1]
      if (!parent) return json({ error: { code: 400, message: `unexpected q: ${q}` } }, 400)
      const filesInFolder = await Promise.all(
        this.files
          .filter((f) => f.parent === parent && !f.trashed)
          .map(async ({ id, name, data }) => {
            const bytes = new Uint8Array(await new Blob([data]).arrayBuffer())
            return {
              id,
              name,
              size: String(bytes.byteLength),
              md5Checksum: fakeDigest(bytes),
            }
          }),
      )
      const inFolder = [
        ...this.folders
          .filter((f) => f.parent === parent && !f.trashed)
          .map(({ id, name }) => ({ id, name, mimeType: FOLDER_TYPE })),
        ...filesInFolder,
      ]
      const start = Number(url.searchParams.get('pageToken') ?? 0)
      const page = inFolder.slice(start, start + this.pageSize)
      const more = start + this.pageSize < inFolder.length
      return json({
        files: page,
        ...(more && { nextPageToken: String(start + this.pageSize) }),
      })
    }
    const fileMatch = /^\/(?:upload\/)?drive\/v3\/files\/([^/]+)$/.exec(path)
    if (fileMatch) {
      const folder = this.folders.find((f) => f.id === fileMatch[1])
      if (folder && method === 'DELETE') {
        this.folders.splice(this.folders.indexOf(folder), 1)
        return new Response(null, { status: 204 })
      }
      const file = this.files.find((f) => f.id === fileMatch[1])
      if (!file) return json({ error: { code: 404 } }, 404)
      if (method === 'GET' && url.searchParams.get('alt') === 'media') {
        return new Response(file.data)
      }
      if (method === 'DELETE' && !path.startsWith('/upload/')) {
        this.files.splice(this.files.indexOf(file), 1)
        return new Response(null, { status: 204 })
      }
      if (method === 'PATCH' && url.searchParams.get('uploadType') === 'media') {
        file.data = init.body instanceof Blob ? init.body : String(init.body)
        return json({ id: file.id })
      }
      if (method === 'PATCH' && !path.startsWith('/upload/')) {
        const addParents = url.searchParams.get('addParents')
        if (!addParents) return json({ error: { code: 400 } }, 400)
        const target = this.folderOf([addParents])
        if (!target) return json({ error: { code: 400 } }, 400)
        file.parent = target
        return json({ id: file.id })
      }
    }
    if (method === 'GET' && path === '/drive/v3/about') {
      const used = this.files.reduce(
        (sum, f) => sum + (typeof f.data === 'string' ? f.data.length : f.data.size),
        0,
      )
      const limit = this.free === null ? undefined : String(this.free + used)
      return json({ storageQuota: { usage: String(used), ...(limit && { limit }) } })
    }
    if (method === 'POST' && path === '/drive/v3/files') {
      const metadata = JSON.parse(String(init.body)) as {
        name: string
        mimeType?: string
        parents?: string[]
      }
      if (metadata.mimeType === FOLDER_TYPE) {
        const parent = metadata.parents ? this.folderOf(metadata.parents) : undefined
        if (metadata.parents && !parent) return json({}, 400)
        const folder: DriveFolder = {
          id: `d${this.nextId++}`,
          name: metadata.name,
          ...(parent && { parent }),
        }
        this.folders.push(folder)
        return json({ id: folder.id })
      }
      const parent = this.folderOf(metadata.parents)
      if (!parent) return json({}, 400)
      const file = { id: `f${this.nextId++}`, name: metadata.name, data: '', parent }
      this.files.push(file)
      return json({ id: file.id })
    }
    if (method === 'POST' && path === '/upload/drive/v3/files') {
      const type = (init.headers as Record<string, string>)['Content-Type'] ?? ''
      const boundary = /boundary=(.+)$/.exec(type)?.[1]
      const parts = String(init.body)
        .split(`--${boundary}`)
        .slice(1, -1)
        .map((part) => part.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''))
      const metadata = JSON.parse(parts[0]!) as { name: string; parents?: string[] }
      const parent = this.folderOf(metadata.parents)
      if (!parent) return json({}, 400)
      const file = { id: `f${this.nextId++}`, name: metadata.name, data: parts[1]!, parent }
      this.files.push(file)
      return json({ id: file.id })
    }
    return json({ error: { code: 400, message: `unexpected ${method} ${path}` } }, 400)
  }
}

function fakeDigest(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5
  let h2 = 0x9e3779b9
  for (const byte of bytes) {
    h1 = Math.imul(h1 ^ byte, 0x01000193)
    h2 = Math.imul(h2 ^ (byte + 1), 0x85ebca6b)
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
