export type ThemeMode = 'dark' | 'light' | 'paper' | 'system'

export interface Palette {
  bg: string
  bgRaised: string
  bgHover: string
  border: string
  text: string
  textDim: string
  accent: string
  accentDim: string
  guide: string
  /** Shelf dots in the library. */
  shelfBlue: string
  shelfGreen: string
  shelfAmber: string
  shelfViolet: string
}

// Mirrors src/index.css's `:root` custom properties — keep the two in
// sync. Dark is ui/style.py's palette; light is new for the web app.
export const DARK_PALETTE: Palette = {
  bg: '#16181d',
  bgRaised: '#1e2128',
  bgHover: '#272b34',
  border: '#32373f',
  text: '#e6e8ec',
  textDim: '#8c93a0',
  accent: '#ff5a5f',
  accentDim: '#7a2e31',
  guide: '#3a404a',
  shelfBlue: '#5b9cf6',
  shelfGreen: '#4fbf8a',
  shelfAmber: '#e5a83b',
  shelfViolet: '#a78bfa',
}

const LIGHT_PALETTE: Palette = {
  bg: '#fafafa',
  bgRaised: '#ffffff',
  bgHover: '#f0f0f2',
  border: '#dcdfe4',
  text: '#16181d',
  textDim: '#6b7280',
  accent: '#e0393e',
  accentDim: '#f6d4d5',
  guide: '#c7cbd1',
  shelfBlue: '#2f6fd6',
  shelfGreen: '#23915c',
  shelfAmber: '#b7791f',
  shelfViolet: '#7c5cd6',
}

// Warm off-white for long reading, like a printed page.
const PAPER_PALETTE: Palette = {
  bg: '#f5efe3',
  bgRaised: '#fbf7ef',
  bgHover: '#ebe2d1',
  border: '#e0d6c3',
  text: '#2b2620',
  textDim: '#675e51',
  accent: '#c2410c',
  accentDim: '#f0cfae',
  guide: '#cfc3ad',
  shelfBlue: '#3b6ea8',
  shelfGreen: '#4a7d4f',
  shelfAmber: '#a8701c',
  shelfViolet: '#7a5a9e',
}

/** The focus-letter colours offered in settings, besides the theme's own
 * accent. Stored as the colour itself, so a reader's pick survives a change
 * of theme. */
export const ORP_CHOICES = [
  { label: 'Coral', hex: '#ff5a5f' },
  { label: 'Amber', hex: '#f5a524' },
  { label: 'Blue', hex: '#5aa9ff' },
  { label: 'Green', hex: '#3fcf8e' },
] as const

export function resolvePalette(mode: ThemeMode): Palette {
  if (mode === 'light') return LIGHT_PALETTE
  if (mode === 'paper') return PAPER_PALETTE
  if (mode === 'dark') return DARK_PALETTE
  const prefersLight =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
  return prefersLight ? LIGHT_PALETTE : DARK_PALETTE
}

/** Sets the `data-theme` attribute the CSS variables in index.css key off
 * of. `'system'` removes the attribute, letting the `prefers-color-scheme`
 * media query in index.css take over. */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement
  if (mode === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', mode)
}
