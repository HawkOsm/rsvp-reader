import { getSetting, setSetting } from '@/storage/settings'
import { getDb } from '@/storage/schema'

// The app store's one door to storage: user preferences as key/value pairs.

export const loadSetting = <T>(key: string, fallback: T) => getSetting(getDb(), key, fallback)
export const saveSetting = (key: string, value: unknown) => setSetting(getDb(), key, value)
