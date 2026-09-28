import { create } from 'zustand'
import { DEFAULT_WPM } from '../core/pacing'
import { getDb } from '../storage/schema'
import { getSetting, setSetting } from '../storage/settings'
import { applyTheme, type ThemeMode } from './theme'

export type ReadingMode = 'rsvp' | 'book'

export interface Settings {
  theme: ThemeMode
  defaultWpm: number
  fontFamily: string
  fontSize: number
  /** Overrides the palette's accent color for the ORP letter specifically,
   * when set — `null` means "use the theme's own accent". */
  orpColor: string | null
  panelOpen: boolean
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  defaultWpm: DEFAULT_WPM,
  fontFamily: 'Inter, "Noto Sans", "Liberation Sans", "Helvetica Neue", Arial, sans-serif',
  fontSize: 56,
  orpColor: null,
  panelOpen: false,
}

interface AppState extends Settings {
  settingsLoaded: boolean
  mode: ReadingMode

  loadSettings: () => Promise<void>
  setTheme: (theme: ThemeMode) => void
  setDefaultWpm: (wpm: number) => void
  setFontFamily: (fontFamily: string) => void
  setFontSize: (fontSize: number) => void
  setOrpColor: (color: string | null) => void
  setPanelOpen: (open: boolean) => void
  setMode: (mode: ReadingMode) => void
}

function persist<K extends keyof Settings>(key: K, value: Settings[K]): void {
  void setSetting(getDb(), key, value)
}

export const useAppStore = create<AppState>((set) => ({
  ...DEFAULT_SETTINGS,
  settingsLoaded: false,
  mode: 'rsvp',

  loadSettings: async () => {
    const db = getDb()
    const [theme, defaultWpm, fontFamily, fontSize, orpColor, panelOpen] = await Promise.all([
      getSetting(db, 'theme', DEFAULT_SETTINGS.theme),
      getSetting(db, 'defaultWpm', DEFAULT_SETTINGS.defaultWpm),
      getSetting(db, 'fontFamily', DEFAULT_SETTINGS.fontFamily),
      getSetting(db, 'fontSize', DEFAULT_SETTINGS.fontSize),
      getSetting(db, 'orpColor', DEFAULT_SETTINGS.orpColor),
      getSetting(db, 'panelOpen', DEFAULT_SETTINGS.panelOpen),
    ])
    applyTheme(theme)
    set({
      theme,
      defaultWpm,
      fontFamily,
      fontSize,
      orpColor,
      panelOpen,
      settingsLoaded: true,
    })
  },

  setTheme: (theme) => {
    applyTheme(theme)
    persist('theme', theme)
    set({ theme })
  },
  setDefaultWpm: (defaultWpm) => {
    persist('defaultWpm', defaultWpm)
    set({ defaultWpm })
  },
  setFontFamily: (fontFamily) => {
    persist('fontFamily', fontFamily)
    set({ fontFamily })
  },
  setFontSize: (fontSize) => {
    persist('fontSize', fontSize)
    set({ fontSize })
  },
  setOrpColor: (orpColor) => {
    persist('orpColor', orpColor)
    set({ orpColor })
  },
  setPanelOpen: (panelOpen) => {
    persist('panelOpen', panelOpen)
    set({ panelOpen })
  },

  setMode: (mode) => set({ mode }),
}))

export function currentSettings(): Settings {
  const state = useAppStore.getState()
  return {
    theme: state.theme,
    defaultWpm: state.defaultWpm,
    fontFamily: state.fontFamily,
    fontSize: state.fontSize,
    orpColor: state.orpColor,
    panelOpen: state.panelOpen,
  }
}
