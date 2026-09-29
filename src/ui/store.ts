import { create } from 'zustand'
import { DEFAULT_WPM } from '../core/pacing'
import { getDb } from '../storage/schema'
import { getSetting, setSetting } from '../storage/settings'
import { clampZoom, type BookFit, type BookLayout } from './book-nav'
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
  /** Book mode: an open two-page spread, or one page at a time. */
  bookLayout: BookLayout
  /** Book mode: page size as a multiple of the fitted size. */
  bookZoom: number
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  defaultWpm: DEFAULT_WPM,
  fontFamily: 'Inter, "Noto Sans", "Liberation Sans", "Helvetica Neue", Arial, sans-serif',
  fontSize: 56,
  orpColor: null,
  panelOpen: false,
  bookLayout: 'spread',
  bookZoom: 1,
}

interface AppState extends Settings {
  settingsLoaded: boolean
  mode: ReadingMode
  /** Not persisted: it follows the layout (whole spread / fill the width).
   * Picking one snaps the page size back to that fit. */
  bookFit: BookFit

  loadSettings: () => Promise<void>
  setTheme: (theme: ThemeMode) => void
  setDefaultWpm: (wpm: number) => void
  setFontFamily: (fontFamily: string) => void
  setFontSize: (fontSize: number) => void
  setOrpColor: (color: string | null) => void
  setPanelOpen: (open: boolean) => void
  setBookLayout: (layout: BookLayout) => void
  setBookZoom: (zoom: number) => void
  setMode: (mode: ReadingMode) => void
  setBookFit: (fit: BookFit) => void
}

// A spread is meant to be seen whole; a single page usually wants the
// width. The fit button can still override either.
const fitFor = (layout: BookLayout): BookFit => (layout === 'spread' ? 'page' : 'width')

export const useAppStore = create<AppState>((set) => {
  /** A setter that saves the value and updates the store. */
  const setter =
    <K extends keyof Settings>(key: K) =>
    (value: Settings[K]) => {
      void setSetting(getDb(), key, value)
      set({ [key]: value } as Pick<Settings, K>)
    }

  return {
    ...DEFAULT_SETTINGS,
    settingsLoaded: false,
    mode: 'rsvp',
    bookFit: fitFor(DEFAULT_SETTINGS.bookLayout),

    loadSettings: async () => {
      const db = getDb()
      const keys = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]
      const values = await Promise.all(keys.map((k) => getSetting(db, k, DEFAULT_SETTINGS[k])))
      const loaded = Object.fromEntries(keys.map((k, i) => [k, values[i]])) as unknown as Settings
      applyTheme(loaded.theme)
      set({ ...loaded, bookFit: fitFor(loaded.bookLayout), settingsLoaded: true })
    },

    setTheme: (theme) => {
      applyTheme(theme)
      setter('theme')(theme)
    },
    setDefaultWpm: setter('defaultWpm'),
    setFontFamily: setter('fontFamily'),
    setFontSize: setter('fontSize'),
    setOrpColor: setter('orpColor'),
    setPanelOpen: setter('panelOpen'),
    setBookZoom: (zoom) => setter('bookZoom')(clampZoom(zoom)),
    // Choosing a fit (or a layout, which picks one) sizes the page to that
    // fit, so any manual size from the slider is dropped.
    setBookLayout: (bookLayout) => {
      setter('bookLayout')(bookLayout)
      setter('bookZoom')(1)
      set({ bookFit: fitFor(bookLayout) })
    },

    setMode: (mode) => set({ mode }),
    setBookFit: (bookFit) => {
      setter('bookZoom')(1)
      set({ bookFit })
    },
  }
})
