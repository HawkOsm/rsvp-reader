import type { RefObject } from 'react'
import { pageOverlayBox, type OverlayBox } from '@/features/reader/page-overlay'
import { useAppStore } from '@/stores/app-store'
import { useElementSize } from './usePdfDocument'

/** Where the page fits in the reading area `ref` points at, or `null` while
 * its size is unknown or when there is no room that keeps it off the word. Follows the area as it resizes and the text size setting. */
export function usePageOverlay(ref: RefObject<HTMLElement | null>): OverlayBox | null {
  const area = useElementSize(ref)
  const fontSize = useAppStore((s) => s.fontSize)
  return area ? pageOverlayBox(area, fontSize) : null
}
