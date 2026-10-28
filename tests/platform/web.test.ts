import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPlatform } from '@/platform'
import { webPlatform } from '@/platform/web'

afterEach(() => {
  vi.unstubAllGlobals()
  document.head.querySelector('meta[name="theme-color"]')?.remove()
})

describe('the web platform', () => {
  it('is what a plain browser gets, and updates itself', async () => {
    const platform = await getPlatform()
    expect(platform.kind).toBe('web')
    expect(platform.selfUpdates).toBe(true)
    await expect(platform.takeLaunchFile()).resolves.toBeNull()
  })

  it('keeps the screen on through the Wake Lock API, and lets go', async () => {
    const release = vi.fn(async () => {})
    const request = vi.fn(async () => ({ release }))
    vi.stubGlobal('navigator', { wakeLock: { request } })
    const lock = await webPlatform.keepScreenOn()
    expect(request).toHaveBeenCalledWith('screen')
    lock?.release()
    expect(release).toHaveBeenCalled()
  })

  it('has no screen lock where the browser has none, or refuses', async () => {
    vi.stubGlobal('navigator', {})
    await expect(webPlatform.keepScreenOn()).resolves.toBeNull()
    vi.stubGlobal('navigator', { wakeLock: { request: () => Promise.reject(new Error('no')) } })
    await expect(webPlatform.keepScreenOn()).resolves.toBeNull()
  })

  it('colours the browser toolbar through the theme-color meta tag', () => {
    webPlatform.setChromeColor('#fafafa', false)
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#fafafa',
    )
  })

  it('saves text as a browser download', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:notes')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    expect(webPlatform.savesFiles).toBe(true)
    await webPlatform.saveTextFile('Book - notes.md', '# Notes', 'text/markdown')
    const link = click.mock.instances[0] as unknown as HTMLAnchorElement
    expect(link.download).toBe('Book - notes.md')
    expect(link.href).toBe('blob:notes')
    expect(await (created.mock.calls[0]![0] as Blob).text()).toBe('# Notes')
    vi.restoreAllMocks()
  })
})
