import { describe, expect, it, vi } from 'vitest'
import { DRIVE_SCOPE } from '@/platform/google-auth'
import { createPkceAuth, pkcePair, type PkceNative } from '@/platform/pkce-auth'

/** A browser, token endpoint and keychain the test controls. `answer`
 * decides what the browser comes back with, given the URL it was sent to. */
function fakeNative(
  answer: (url: URL) => string = (url) => `code=c1&state=${url.searchParams.get('state')}`,
) {
  const keychain = new Map<string, string>()
  const posts: { endpoint: string; form: Record<string, string> }[] = []
  let opened: URL | null = null
  const tokens: Record<string, { status: number; body: unknown }> = {
    authorization_code: {
      status: 200,
      body: { access_token: 'a1', expires_in: 3599, refresh_token: 'r1', scope: DRIVE_SCOPE },
    },
    refresh_token: { status: 200, body: { access_token: 'a2', expires_in: 3599 } },
  }
  const native: PkceNative = {
    listen: async () => ({ port: 4321, callback: async () => answer(opened!) }),
    openBrowser: async (url) => void (opened = new URL(url)),
    post: async (endpoint, form) => {
      posts.push({ endpoint, form })
      const reply = endpoint === 'revoke' ? { status: 200, body: {} } : tokens[form.grant_type!]!
      return { status: reply.status, body: JSON.stringify(reply.body) }
    },
    secrets: {
      get: async (k) => keychain.get(k) ?? null,
      set: async (k, v) => void keychain.set(k, v),
      delete: async (k) => void keychain.delete(k),
    },
  }
  return { native, keychain, posts, tokens, opened: () => opened }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

describe('desktop sign-in (PKCE, loopback)', () => {
  it('makes an S256 challenge from its verifier', async () => {
    // RFC 7636, appendix B.
    const bytes = new Uint8Array([
      116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77,
      105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121,
    ])
    expect(await pkcePair(() => bytes)).toEqual({
      verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    })
  })

  it('signs in through the browser, and keeps the refresh token in the keychain', async () => {
    const fake = fakeNative()
    const auth = createPkceAuth({ clientId: 'desk', clientSecret: 's3', native: fake.native })
    await auth.signIn()

    const url = fake.opened()!
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'desk',
      redirect_uri: 'http://127.0.0.1:4321',
      scope: DRIVE_SCOPE,
      code_challenge_method: 'S256',
      access_type: 'offline',
    })
    const exchange = fake.posts[0]!.form
    expect(exchange).toMatchObject({
      grant_type: 'authorization_code',
      code: 'c1',
      client_id: 'desk',
      client_secret: 's3',
      redirect_uri: 'http://127.0.0.1:4321',
    })
    // The verifier sent is the one the challenge was made from.
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(exchange.code_verifier),
    )
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(url.searchParams.get('code_challenge')).toBe(challenge)

    expect(auth.state()).toBe('signed-in')
    expect(await auth.getToken()).toBe('a1')
    expect(fake.keychain.get('google-refresh-token')).toBe('r1')
  })

  it('stays connected across a restart, renewing the token without asking', async () => {
    const fake = fakeNative()
    fake.keychain.set('google-refresh-token', 'r1')
    let now = 0
    const auth = createPkceAuth({ clientId: 'desk', native: fake.native, now: () => now })
    await settle()
    expect(auth.state()).toBe('signed-out') // the keychain isn't read until asked
    auth.subscribe(() => {})
    await settle()
    expect(auth.state()).toBe('signed-in')
    expect(await auth.getToken()).toBe('a2')
    expect(fake.posts[0]!.form).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'r1' })
    expect(fake.opened()).toBeNull()

    now = 3_600_000 // the access token has run out: renewed again, silently
    expect(await auth.getToken()).toBe('a2')
    expect(fake.posts).toHaveLength(2)
    expect(await auth.renewToken()).toBe('a2') // after a 401
  })

  it('needs a reconnect once Google refuses the refresh token, and forgets it', async () => {
    const fake = fakeNative()
    fake.keychain.set('google-refresh-token', 'old')
    fake.tokens.refresh_token = { status: 400, body: { error: 'invalid_grant' } }
    const auth = createPkceAuth({ clientId: 'desk', native: fake.native })
    auth.subscribe(() => {})
    await settle()
    expect(await auth.getToken()).toBeNull()
    expect(auth.state()).toBe('needs-reconnect')
    expect(fake.keychain.has('google-refresh-token')).toBe(false)
  })

  it('refuses an answer meant for another request, or a refusal', async () => {
    const forged = fakeNative(() => 'code=evil&state=wrong')
    const auth = createPkceAuth({ clientId: 'desk', native: forged.native })
    await expect(auth.signIn()).rejects.toThrow(/another request/)
    expect(auth.state()).toBe('signed-out')
    expect(forged.posts).toEqual([])

    const denied = fakeNative((url) => `error=access_denied&state=${url.searchParams.get('state')}`)
    await expect(
      createPkceAuth({ clientId: 'desk', native: denied.native }).signIn(),
    ).rejects.toThrow(/wasn’t allowed/)
  })

  it('signs out by forgetting the refresh token and revoking it', async () => {
    const fake = fakeNative()
    const auth = createPkceAuth({ clientId: 'desk', native: fake.native })
    await auth.signIn()
    await auth.signOut()
    expect(auth.state()).toBe('signed-out')
    expect(fake.keychain.size).toBe(0)
    expect(fake.posts.at(-1)).toEqual({ endpoint: 'revoke', form: { token: 'r1' } })
    expect(await auth.getToken()).toBeNull()
  })

  it('a retried sign-in drops the first browser answer without using its code', async () => {
    const answers: ((query: string) => void)[] = []
    const fake = fakeNative()
    fake.native.listen = async () => ({
      port: 4321,
      callback: () => new Promise<string>((resolve) => answers.push(resolve)),
    })
    const auth = createPkceAuth({ clientId: 'desk', native: fake.native, signInTimeoutMs: 20 })
    await expect(auth.signIn()).rejects.toThrow(/hasn’t finished/)
    expect(auth.state()).toBe('signed-out')

    const retry = auth.signIn()
    await settle()
    const state = (n: number) => fake.opened()!.searchParams.get('state') ?? String(n)
    answers[0]!(`code=stale&state=${state(0)}`) // the first tab comes back
    await settle()
    expect(fake.posts).toEqual([])
    answers[1]!(`code=c2&state=${state(1)}`)
    await retry
    expect(fake.posts).toHaveLength(1)
    expect(fake.posts[0]!.form.code).toBe('c2')
    expect(auth.state()).toBe('signed-in')
  })

  it('offers the sign-in link while waiting, past the 20 seconds, and drops it once done', async () => {
    let answer!: (query: string) => void
    const fake = fakeNative()
    fake.native.listen = async () => ({
      port: 4321,
      callback: () => new Promise<string>((resolve) => (answer = resolve)),
    })
    const auth = createPkceAuth({ clientId: 'desk', native: fake.native, signInTimeoutMs: 20 })
    const heard = vi.fn()
    auth.subscribe(heard)
    expect(auth.signInLink()).toBeNull()
    const result = auth.signIn()
    await settle()
    expect(auth.signInLink()).toBe(fake.opened()!.toString())
    expect(heard).toHaveBeenCalled()

    await expect(result).rejects.toThrow(/hasn’t finished/)
    expect(auth.signInLink()).toBe(fake.opened()!.toString()) // still good to finish elsewhere

    answer(`code=c1&state=${fake.opened()!.searchParams.get('state')}`)
    await vi.waitFor(() => expect(auth.state()).toBe('signed-in'))
    expect(auth.signInLink()).toBeNull()
  })

  it('drops the link when the sign-in fails or is signed out of', async () => {
    const denied = fakeNative((url) => `error=access_denied&state=${url.searchParams.get('state')}`)
    const auth = createPkceAuth({ clientId: 'desk', native: denied.native })
    await expect(auth.signIn()).rejects.toThrow()
    expect(auth.signInLink()).toBeNull()
  })
})
