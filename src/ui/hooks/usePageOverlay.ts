import type { RefObject } from 'react'
import { pagePlacement, type PagePlacement } from '../page-overlay'
import { useAppStore } from '../store'
import { useElementSize } from './usePdfDocument'

/** Where the page fits in the reading area `ref` points at, or `null` while
 * its size is unknown or when there is no room that keeps it off the word. Follows the area as it resizes and the text size setting. */
export function usePageOverlay(ref: RefObject<HTMLElement | null>): PagePlacement | null {
  const area = useElementSize(ref)
  const fontSize = useAppStore((s) => s.fontSize)
  return area ? pagePlacement(area, fontSize) : null
}
