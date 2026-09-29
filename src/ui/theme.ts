export type ThemeMode = 'dark' | 'light' | 'system'

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
}

export function resolvePalette(mode: ThemeMode): Palette {
  if (mode === 'light') return LIGHT_PALETTE
  if (mode === 'dark') return DARK_PALETTE
  const prefersLight =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: light)').matches
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
