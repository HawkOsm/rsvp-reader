import { describe, expect, it, vi } from 'vitest'
import {
  createGoogleAuth,
  DRIVE_SCOPE,
  type GoogleOAuth2,
  type TokenResponse,
} from '@/platform/google-auth'

/** A stand-in for Google's script: answers each sign-in with `reply`. */
function fakeGis(
  reply: (cb: (r: TokenResponse) => void, err: (e: { type: string }) => void) => void,
) {
  const requests: { client_id: string; scope: string }[] = []
  const gis: GoogleOAuth2 = {
    initTokenClient: ({ client_id, scope, callback, error_callback }) => ({
      requestAccessToken: () => {
        requests.push({ client_id, scope })
        reply(callback, error_callback ?? (() => {}))
      },
    }),
    hasGrantedAllScopes: (response) => response.access_token !== 'no-scope',
    revoke: vi.fn(),
  }
  return { gis, requests }
}

function memoryStorage() {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  }
}

const granted = (cb: (r: TokenResponse) => void) => cb({ access_token: 'tok', expires_in: 3599 })

describe('Google sign-in for sync', () => {
  it('loads Google’s script only when the user signs in, and asks for app data only', async () => {
    const { gis, requests } = fakeGis(granted)
    const loadGis = vi.fn(async () => gis)
    const auth = createGoogleAuth({ clientId: 'id', loadGis, storage: memoryStorage() })
    expect(auth.state()).toBe('signed-out')
    expect(await auth.getToken()).toBeNull()
    expect(loadGis).not.toHaveBeenCalled()

    await auth.signIn()
    expect(loadGis).toHaveBeenCalledOnce()
    expect(requests).toEqual([{ client_id: 'id', scope: DRIVE_SCOPE }])
    expect(auth.state()).toBe('signed-in')
    expect(await auth.getToken()).toBe('tok')
  })

  it('needs a reconnect once the token runs out, and after a refusal', async () => {
    let now = 0
    const { gis } = fakeGis(granted)
    const auth = createGoogleAuth({
      clientId: 'id',
      loadGis: async () => gis,
      storage: memoryStorage(),
      now: () => now,
    })
    const changes = vi.fn()
    auth.subscribe(changes)
    await auth.signIn()
    now = 3_550_000 // within a minute of the hour
    expect(await auth.getToken()).toBeNull()
    expect(auth.state()).toBe('needs-reconnect')

    await auth.signIn()
    expect(await auth.renewToken()).toBeNull()
    expect(auth.state()).toBe('needs-reconnect')
    expect(changes).toHaveBeenCalled()
  })

  it('remembers that the user connected, but not the token', async () => {
    const storage = memoryStorage()
    const { gis } = fakeGis(granted)
    await createGoogleAuth({ clientId: 'id', loadGis: async () => gis, storage }).signIn()
    expect([...storage.items.values()].join()).not.toContain('tok')
    expect(storage.getItem('rsvp-reader:sync-connected')).toBe('1')

    const reopened = createGoogleAuth({ clientId: 'id', loadGis: async () => gis, storage })
    expect(reopened.state()).toBe('needs-reconnect')
    expect(await reopened.getToken()).toBeNull()

    await reopened.signIn()
    await reopened.signOut()
    expect(gis.revoke).toHaveBeenCalledWith('tok')
    expect(reopened.state()).toBe('signed-out')
    expect(storage.getItem('rsvp-reader:sync-connected')).toBeNull()
  })

  it('says why sign-in failed, and goes back to where it was', async () => {
    const blocked = fakeGis((_cb, err) => err({ type: 'popup_failed_to_open' })).gis
    const auth = createGoogleAuth({ clientId: 'id', loadGis: async () => blocked, storage: null })
    await expect(auth.signIn()).rejects.toThrow(/blocked/)
    expect(auth.state()).toBe('signed-out')

    const noScope = fakeGis((cb) => cb({ access_token: 'no-scope', expires_in: 3599 })).gis
    const refused = createGoogleAuth({
      clientId: 'id',
      loadGis: async () => noScope,
      storage: null,
    })
    await expect(refused.signIn()).rejects.toThrow(/Drive access/)
    expect(await refused.getToken()).toBeNull()
  })

  it('refuses to sign in without a client ID, without loading anything', async () => {
    const loadGis = vi.fn()
    const auth = createGoogleAuth({ clientId: '', loadGis, storage: null })
    await expect(auth.signIn()).rejects.toThrow(/client ID/)
    expect(loadGis).not.toHaveBeenCalled()
  })
})
