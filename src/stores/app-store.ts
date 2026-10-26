import { create } from 'zustand'
import { DEFAULT_WPM } from '@/core/pacing'
import { loadSetting, saveSetting } from './api/settings'
import { clampScale, type PageSpread, type FitScales } from '@/lib/book-layout'
import { applyTheme, type ThemeMode } from '@/lib/theme'

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
  bookLayout: PageSpread
  /** Book mode page size — the PDF scale, 1 = 100%. `null` until first fitted. */
  bookScale: number | null
  /** The reader's keyboard cheat-sheet under the controls. */
  showHints: boolean
  /** The library shows covers in a grid, or one row per book. */
  libraryView: LibraryView
}

export type LibraryView = 'grid' | 'list'

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  defaultWpm: DEFAULT_WPM,
  fontFamily: 'Inter, "Noto Sans", "Liberation Sans", "Helvetica Neue", Arial, sans-serif',
  fontSize: 56,
  orpColor: null,
  panelOpen: false,
  bookLayout: 'spread',
  bookScale: null,
  showHints: true,
  libraryView: 'grid',
}

interface AppState extends Settings {
  settingsLoaded: boolean
  mode: ReadingMode
  /** What fitting the page / the width would currently come to. */
  bookFits: FitScales | null
  /** A fit to apply as soon as the page sizes are known. */
  pendingFit: keyof FitScales | null
  /** Set when a backwards page turn should land at the bottom of the
   * previous spread. The page view reads it once, with
   * `consumeArriveAtBottom`, when the spread changes, and applies it after
   * the new pages have laid out. */
  arriveAtBottom: boolean

  loadSettings: () => Promise<void>
  setTheme: (theme: ThemeMode) => void
  setDefaultWpm: (wpm: number) => void
  setFontFamily: (fontFamily: string) => void
  setFontSize: (fontSize: number) => void
  setOrpColor: (color: string | null) => void
  setPanelOpen: (open: boolean) => void
  setShowHints: (show: boolean) => void
  setLibraryView: (view: LibraryView) => void
  setBookLayout: (layout: PageSpread) => void
  setBookScale: (scale: number) => void
  stepBookScale: (delta: number) => void
  setBookFits: (fits: FitScales) => void
  fitBook: () => void
  setMode: (mode: ReadingMode) => void
  setArriveAtBottom: (value: boolean) => void
  consumeArriveAtBottom: () => boolean
}

// A spread is meant to be seen whole; a single page usually wants the width.
const fitFor = (layout: PageSpread): keyof FitScales => (layout === 'spread' ? 'page' : 'width')

export const useAppStore = create<AppState>((set, get) => {
  /** A setter that saves the value and updates the store. */
  const setter =
    <K extends keyof Settings>(key: K) =>
    (value: Settings[K]) => {
      void saveSetting(key, value)
      set({ [key]: value } as Pick<Settings, K>)
    }

  return {
    ...DEFAULT_SETTINGS,
    settingsLoaded: false,
    mode: 'rsvp',
    bookFits: null,
    pendingFit: fitFor(DEFAULT_SETTINGS.bookLayout),
    arriveAtBottom: false,

    loadSettings: async () => {
      const keys = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]
      const values = await Promise.all(keys.map((k) => loadSetting(k, DEFAULT_SETTINGS[k])))
      const loaded = Object.fromEntries(keys.map((k, i) => [k, values[i]])) as unknown as Settings
      applyTheme(loaded.theme)
      set({
        ...loaded,
        settingsLoaded: true,
        pendingFit: loaded.bookScale === null ? fitFor(loaded.bookLayout) : null,
      })
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
    setShowHints: setter('showHints'),
    setLibraryView: setter('libraryView'),
    // The layout picks a fit; it lands once the new page sizes are known.
    setBookLayout: (bookLayout) => {
      setter('bookLayout')(bookLayout)
      set({ pendingFit: fitFor(bookLayout) })
    },

    setBookScale: (scale) => {
      setter('bookScale')(clampScale(scale))
      set({ pendingFit: null })
    },
    stepBookScale: (delta) => {
      const { bookScale, bookFits, setBookScale } = get()
      setBookScale((bookScale ?? bookFits?.page ?? 1) + delta)
    },

    setBookFits: (bookFits) => {
      const { pendingFit, setBookScale } = get()
      set({ bookFits })
      if (pendingFit) setBookScale(bookFits[pendingFit])
    },
    /** Fit the whole page; pressed again, fit the width. Just sets the scale. */
    fitBook: () => {
      const { bookFits, bookScale, setBookScale } = get()
      if (!bookFits) return
      const atPage = bookScale !== null && Math.abs(bookScale - bookFits.page) < 0.001
      setBookScale(atPage ? bookFits.width : bookFits.page)
    },

    setMode: (mode) => set({ mode }),
    // Both skip the write when nothing changes: every store write re-renders
    // whoever subscribes without a selector, and page turns are frequent.
    setArriveAtBottom: (arriveAtBottom) => {
      if (get().arriveAtBottom !== arriveAtBottom) set({ arriveAtBottom })
    },
    consumeArriveAtBottom: () => {
      const { arriveAtBottom, setArriveAtBottom } = get()
      setArriveAtBottom(false)
      return arriveAtBottom
    },
  }
})
