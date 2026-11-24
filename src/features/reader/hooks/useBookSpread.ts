import { useEffect, useRef } from 'react'
import type { PageSpread } from '@/lib/book-layout'
import { ROOM_FOR_SPREAD, useMediaQuery } from '@/lib/media'
import { useAppStore } from '@/stores/app-store'

/** How many pages book mode shows here: the reader's choice where there is
 * room for two, one page on a small screen (a phone), whatever was chosen.
 * `canSpread` says which, for controls that only make sense with room. */
export function useBookSpread(): { layout: PageSpread; canSpread: boolean } {
  const chosen = useAppStore((s) => s.bookLayout)
  const canSpread = useMediaQuery(ROOM_FOR_SPREAD)
  return { layout: canSpread ? chosen : 'single', canSpread }
}

/** Keep the page fitted to a small screen: its width, each time a book is
 * opened there, since a size chosen on a big screen means nothing on a phone.
 * Coming back to a big screen fits the chosen layout again. A big screen is
 * otherwise left as the reader set it. `active` is whether book mode's pages
 * are what is being drawn. */
export function useSmallScreenFit(canSpread: boolean, active: boolean): void {
  const wasSmall = useRef(false)
  useEffect(() => {
    if (!active) return
    const { requestFit, bookLayout } = useAppStore.getState()
    if (!canSpread) requestFit('width')
    else if (wasSmall.current) requestFit(bookLayout === 'spread' ? 'page' : 'width')
    wasSmall.current = !canSpread
  }, [canSpread, active])
}
