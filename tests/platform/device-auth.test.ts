import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDeviceAuth, googlePost, type DevicePost } from '@/platform/device-auth'
import { DRIVE_SCOPE } from '@/platform/google-auth'

const CODE = {
  device_code: 'dev-1',
  user_code: 'ABCD-EFGH',
  verification_url: 'https://www.google.com/device',
  expires_in: 1800,
  interval: 5,
}
const TOKENS = { access_token: 'a1', expires_in: 3599, refresh_token: 'r1', scope: DRIVE_SCOPE }

/** Google's endpoints, answering the token polls with `polls` in turn (the
 * last one again once they run out), and a clock that `sleep` moves on. */
function fakeGoogle(polls: object[], code: object = CODE) {
  const posts: { endpoint: string; form: Record<string, string> }[] = []
  const store = new Map<string, string>()
  const sleeps: number[] = []
  let clock = 0
  let poll = 0
  const post: DevicePost = async (endpoint, form) => {
    posts.push({ endpoint, form })
    if (endpoint === 'device') return { status: 200, body: JSON.stringify(code) }
    if (endpoint === 'revoke') return { status: 200, body: '{}' }
    if (form.grant_type === 'refresh_token') {
      return { status: 200, body: JSON.stringify({ access_token: 'a2', expires_in: 3599 }) }
    }
    const answer = polls[Math.min(poll++, polls.length - 1)]
    return { status: 200, body: JSON.stringify(answer) }
  }
  const options = {
    clientId: 'tv',
    clientSecret: 's3',
    post,
    secrets: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => void store.set(k, v),
      delete: async (k: string) => void store.delete(k),
    },
    now: () => clock,
    sleep: async (ms: number) => {
      sleeps.push(ms)
      clock += ms
    },
  }
  return { options, posts, store, sleeps }
}

const pending = { error: 'authorization_pending' }

describe('sign-in with a code', () => {
  it('shows the code, asks until it has been entered, and keeps the sign-in', async () => {
    const google = fakeGoogle([pending, pending, TOKENS])
    const auth = createDeviceAuth(google.options)
    const shown: (string | null)[] = []
    auth.subscribe(() => shown.push(auth.signInCode()))
    await auth.signIn()

    expect(google.posts[0]).toEqual({
      endpoint: 'device',
      form: { client_id: 'tv', scope: DRIVE_SCOPE },
    })
    expect(shown).toContain('ABCD-EFGH')
    expect(google.posts.filter((p) => p.endpoint === 'token')).toHaveLength(3)
    expect(google.posts[1]!.form).toEqual({
      client_id: 'tv',
      client_secret: 's3',
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: 'dev-1',
    })
    expect(google.sleeps).toEqual([5000, 5000, 5000])

    expect(auth.state()).toBe('signed-in')
    expect(await auth.getToken()).toBe('a1')
    expect(google.store.get('google-refresh-token')).toBe('r1')
    // Done: the code is no longer shown.
    expect(auth.signInCode()).toBeNull()
    expect(auth.signInLink()).toBeNull()
  })

  it('shows where to enter the code while it waits', async () => {
    let entered!: () => void
    const google = fakeGoogle([TOKENS])
    const auth = createDeviceAuth({
      ...google.options,
      sleep: () => new Promise<void>((resolve) => (entered = resolve)),
    })
    const done = auth.signIn()
    await vi.waitFor(() => expect(auth.signInCode()).toBe('ABCD-EFGH'))
    expect(auth.signInLink()).toBe('https://www.google.com/device')
    expect(auth.state()).toBe('signing-in')
    entered()
    await done
    expect(auth.state()).toBe('signed-in')
  })

  it('asks less often when Google says to slow down', async () => {
    const google = fakeGoogle([{ error: 'slow_down' }, pending, TOKENS])
    await createDeviceAuth(google.options).signIn()
    expect(google.sleeps).toEqual([5000, 10_000, 10_000])
  })

  it('says so when access is refused, or the code runs out', async () => {
    const refused = createDeviceAuth(fakeGoogle([{ error: 'access_denied' }]).options)
    await expect(refused.signIn()).rejects.toThrow(/wasn’t allowed/)
    expect(refused.state()).toBe('signed-out')
    expect(refused.signInCode()).toBeNull()

    const expired = createDeviceAuth(fakeGoogle([{ error: 'expired_token' }]).options)
    await expect(expired.signIn()).rejects.toThrow(/ran out/)

    // Never entered: it stops asking when the code's time is up.
    const never = fakeGoogle([pending], { ...CODE, expires_in: 12 })
    await expect(createDeviceAuth(never.options).signIn()).rejects.toThrow(/ran out/)
    expect(never.sleeps).toEqual([5000, 5000, 5000])
  })

  it('reports Google’s own words for any other failure', async () => {
    const wrongClient = fakeGoogle([], {
      error: 'invalid_client',
      error_description: 'No such client.',
    })
    await expect(createDeviceAuth(wrongClient.options).signIn()).rejects.toThrow('No such client.')

    const badPoll = fakeGoogle([{ error: 'invalid_grant', error_description: 'Bad device code.' }])
    await expect(createDeviceAuth(badPoll.options).signIn()).rejects.toThrow('Bad device code.')
  })

  it('stops asking once the user signs out, and keeps nothing', async () => {
    let wake!: () => void
    const google = fakeGoogle([TOKENS])
    const auth = createDeviceAuth({
      ...google.options,
      sleep: () => new Promise<void>((resolve) => (wake = resolve)),
    })
    const done = auth.signIn()
    await vi.waitFor(() => expect(auth.signInCode()).not.toBeNull())
    await auth.signOut()
    wake()
    await done
    expect(google.posts.filter((p) => p.endpoint === 'token')).toHaveLength(0)
    expect(auth.state()).toBe('signed-out')
    expect(google.store.size).toBe(0)
  })

  it('stays connected across a restart, renewing without a new code', async () => {
    const google = fakeGoogle([TOKENS])
    google.store.set('google-refresh-token', 'r1')
    const auth = createDeviceAuth(google.options)
    auth.subscribe(() => {})
    await vi.waitFor(() => expect(auth.state()).toBe('signed-in'))
    expect(await auth.getToken()).toBe('a2')
    expect(google.posts.map((p) => p.endpoint)).toEqual(['token'])
  })
})

describe('googlePost', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts a form to the endpoint named, and hands back an error answer as it is', async () => {
    const fetched = vi.fn(
      async () => new Response('{"error":"authorization_pending"}', { status: 428 }),
    )
    vi.stubGlobal('fetch', fetched)
    const answer = await googlePost('device', { client_id: 'tv', scope: 'a b' })
    expect(answer).toEqual({ status: 428, body: '{"error":"authorization_pending"}' })
    const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://oauth2.googleapis.com/device/code')
    expect(init.method).toBe('POST')
    expect(String(init.body)).toBe('client_id=tv&scope=a+b')
  })
})
