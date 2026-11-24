import { useEffect, useRef, type RefObject } from 'react'
import { wasDismissal } from '@/features/reader/dismissal'
import {
  isDoubleTap,
  pinchRatio,
  swipeTurn,
  tapZone,
  TAP_MAX_MS,
  TAP_SLOP_PX,
  type TapZone,
} from '@/features/reader/book-gestures'

export interface BookGestures {
  /** Whether the page is no wider than its area: then a sideways swipe
   * turns the page; when it is wider, it scrolls the page instead. */
  canSwipe: boolean
  /** The current page scale, and the limits a pinch may take it to. */
  scale: number | null
  minScale: number
  maxScale: number
  onTurn: (direction: 1 | -1) => void
  onZoom: (scale: number) => void
  /** A tap, by where in the area it landed. */
  onTap: (zone: TapZone) => void
  /** A second tap in the middle, soon after the first (which was also
   * given to `onTap`, as this one is). */
  onDoubleTap: () => void
}

interface Touching {
  fingers: Map<number, { x: number; y: number }>
  start: { x: number; y: number; at: number } | null
  lastTap: { x: number; y: number; at: number } | null
  pinch: { distance: number; ratio: number } | null
  /** More than one finger touched since all were up: not a tap or swipe. */
  many: boolean
}

/** Touch gestures on book mode's page: tap an edge or swipe sideways to turn
 * it, tap the middle for the controls, pinch to zoom, double-tap the middle
 * to switch between fitting the page and its width. Fingers only: a mouse
 * selects text and clicks words as before. `area` is the
 * scrolling element; `content` is what a pinch stretches while it lasts, the
 * real zoom being drawn once the fingers lift. */
export function useBookGestures(
  area: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  gestures: BookGestures | null,
): void {
  // What the fingers are doing outlives a change of `gestures` (a tap that
  // hides the controls resizes the page's area, which changes the fits): a
  // second tap must still find the first, and a finger still down its place.
  const touch = useRef<Touching>({
    fingers: new Map(),
    start: null,
    lastTap: null,
    pinch: null,
    many: false,
  })

  useEffect(() => {
    const el = area.current
    if (!el || !gestures) return
    const { canSwipe, scale, minScale, maxScale, onTurn, onZoom, onTap, onDoubleTap } = gestures
    const t = touch.current
    const { fingers } = t

    const distance = () => {
      const [a, b] = [...fingers.values()]
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
    }
    const stretch = (ratio: number | null) => {
      if (!content.current) return
      content.current.style.transform = ratio === null ? '' : `scale(${ratio})`
      content.current.style.transformOrigin = ratio === null ? '' : 'center top'
    }
    const zoneAt = (x: number) => {
      const box = el.getBoundingClientRect()
      return tapZone(x - box.left, box.width)
    }
    /** A finger's tap or swipe must not also click a word. */
    const swallowClick = () => {
      const stop = (e: Event) => e.stopPropagation()
      el.addEventListener('click', stop, { capture: true, once: true })
      setTimeout(() => el.removeEventListener('click', stop, { capture: true }), 400)
    }

    function down(e: PointerEvent) {
      if (e.pointerType !== 'touch' || wasDismissal(e)) return
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (fingers.size === 1) {
        t.start = { x: e.clientX, y: e.clientY, at: e.timeStamp }
        t.many = false
      } else {
        t.many = true
        t.start = null
        if (fingers.size === 2 && scale !== null) t.pinch = { distance: distance(), ratio: 1 }
      }
    }

    function move(e: PointerEvent) {
      if (!fingers.has(e.pointerId)) return
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (t.pinch && fingers.size === 2 && scale !== null) {
        t.pinch.ratio = pinchRatio(t.pinch.distance, distance(), scale, minScale, maxScale)
        stretch(t.pinch.ratio)
      }
    }

    function up(e: PointerEvent) {
      if (!fingers.delete(e.pointerId)) return
      if (t.pinch) {
        if (fingers.size < 2) {
          const { ratio } = t.pinch
          t.pinch = null
          stretch(null)
          // A touch the browser took back (to scroll, say) zooms nothing.
          const cancelled = e.type === 'pointercancel'
          if (!cancelled && scale !== null && Math.abs(ratio - 1) > 0.02) onZoom(scale * ratio)
        }
        return
      }
      if (t.many || !t.start || e.type === 'pointercancel') return
      const dx = e.clientX - t.start.x
      const dy = e.clientY - t.start.y
      const moved = Math.hypot(dx, dy)
      if (moved <= TAP_SLOP_PX) {
        // Held long, it selected text: not a tap.
        if (e.timeStamp - t.start.at <= TAP_MAX_MS) {
          const tap = { x: e.clientX, y: e.clientY, at: e.timeStamp }
          const zone = zoneAt(e.clientX)
          swallowClick()
          onTap(zone)
          if (zone === 'middle' && isDoubleTap(t.lastTap, tap)) {
            t.lastTap = null
            onDoubleTap()
          } else t.lastTap = zone === 'middle' ? tap : null
        }
      } else if (canSwipe) {
        const turn = swipeTurn(dx, dy, e.timeStamp - t.start.at)
        if (turn) {
          swallowClick()
          onTurn(turn)
        }
      }
      t.start = null
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      stretch(null)
    }
  }, [area, content, gestures])
}
