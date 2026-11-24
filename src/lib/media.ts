import { useSyncExternalStore } from 'react'

/** Tailwind's `sm` breakpoint, as a media query. */
export const WIDE = '(min-width: 40rem)'

/** A screen with room for two pages side by side in book mode: a tablet or
 * a desktop window, not a phone either way up. */
export const ROOM_FOR_SPREAD = '(min-width: 48rem) and (min-height: 30rem)'

/** Whether a media query matches, kept up to date. Where there is no
 * `matchMedia` (tests in jsdom) it says `fallback`. */
export function useMediaQuery(query: string, fallback = true): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia?.(query)
      list?.addEventListener('change', onChange)
      return () => list?.removeEventListener('change', onChange)
    },
    () => window.matchMedia?.(query).matches ?? fallback,
  )
}
