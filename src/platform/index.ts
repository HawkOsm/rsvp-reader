import { isTauri } from '@tauri-apps/api/core'
import type { Platform } from './types'
import { webPlatform } from './web'

export type { Platform, PlatformKind, ScreenLock } from './types'

let current: Promise<Platform> | null = null

/** The platform the app is running on, worked out once. Each native
 * implementation is loaded only on its own platform, so the web build never
 * downloads the Capacitor plugins and the Android build never runs Tauri code. */
export function getPlatform(): Promise<Platform> {
  current ??= detect()
  return current
}

async function detect(): Promise<Platform> {
  if (isTauri()) return (await import('./tauri')).tauriPlatform
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.isNativePlatform()) return (await import('./capacitor')).capacitorPlatform
  return webPlatform
}
