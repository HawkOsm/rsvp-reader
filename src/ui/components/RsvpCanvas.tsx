import { memo, useEffect, useRef } from 'react'
import { orpIndex } from '../../core/orp'
import { codePoints } from '../../core/unicode'
import { useEngine, useEngineIndex } from '../engine-context'
import { useAppStore } from '../store'
import { resolvePalette, type Palette } from '../theme'

/** Horizontal position of the ORP letter, as a fraction of the canvas
 * width — matches ui/reader_view.py's FOCUS_X_RATIO exactly. */
const FOCUS_X_RATIO = 0.42
const MIN_FONT_PX = 12
const SIDE_MARGIN_PX = 12

/**
 * Draws the current word with its ORP letter pinned to a fixed x — the eye
 * never moves between words. Ported from RsvpDisplay in ui/reader_view.py:
 * same focus ratio, same two-pass shrink-to-fit, same tick-mark guides.
 *
 * Subscribes to the engine itself, so a word change only ever re-renders
 * this one component.
 */
export const RsvpCanvas = memo(function RsvpCanvas() {
  const engine = useEngine()
  const index = useEngineIndex()
  const palette = resolvePalette(useAppStore((s) => s.theme))
  const fontFamily = useAppStore((s) => s.fontFamily)
  const fontSizePx = useAppStore((s) => s.fontSize)
  const orpColor = useAppStore((s) => s.orpColor)
  const word = engine.tokens[index]?.text ?? ''
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    function draw() {
      if (!canvas || !container) return
      const dpr = window.devicePixelRatio || 1
      const width = container.clientWidth
      const height = Math.max(200, container.clientHeight)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = palette.bg
      ctx.fillRect(0, 0, width, height)

      const focusX = width * FOCUS_X_RATIO
      const centerY = height / 2

      drawGuides(ctx, focusX, centerY, palette, fontSizePx)
      if (!word) return
      drawWord(ctx, word, focusX, centerY, {
        fontFamily,
        fontSizePx,
        width,
        textColor: palette.text,
        orpColor: orpColor ?? palette.accent,
      })
    }

    function schedule() {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(draw)
    }

    schedule()
    const observer = new ResizeObserver(schedule)
    observer.observe(container)
    return () => {
      observer.disconnect()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [word, palette, fontFamily, fontSizePx, orpColor])

  return (
    <div ref={containerRef} className="min-h-[200px] w-full min-w-0 flex-1 overflow-hidden">
      <canvas ref={canvasRef} />
    </div>
  )
})

function drawGuides(
  ctx: CanvasRenderingContext2D,
  focusX: number,
  centerY: number,
  palette: Palette,
  fontSizePx: number,
): void {
  ctx.strokeStyle = palette.guide
  ctx.lineWidth = 2
  const half = fontSizePx * 0.75
  ctx.beginPath()
  ctx.moveTo(focusX, centerY - half - 14)
  ctx.lineTo(focusX, centerY - half)
  ctx.moveTo(focusX, centerY + half)
  ctx.lineTo(focusX, centerY + half + 14)
  ctx.stroke()
}

interface DrawWordOptions {
  fontFamily: string
  fontSizePx: number
  width: number
  textColor: string
  orpColor: string
}

function fontString(sizePx: number, fontFamily: string): string {
  return `500 ${sizePx}px ${fontFamily}`
}

function drawWord(
  ctx: CanvasRenderingContext2D,
  word: string,
  focusX: number,
  centerY: number,
  options: DrawWordOptions,
): void {
  const { fontFamily, width, textColor, orpColor } = options
  const cps = codePoints(word)
  const orp = Math.min(orpIndex(word), cps.length - 1)
  const prefix = cps.slice(0, orp).join('')
  const letter = cps[orp] ?? ''
  const suffix = cps.slice(orp + 1).join('')

  const roomLeft = Math.max(1, focusX - SIDE_MARGIN_PX)
  const roomRight = Math.max(1, width - focusX - SIDE_MARGIN_PX)

  // Two passes: font metrics don't scale perfectly linearly, so the first
  // estimate is verified and nudged down again if needed — same as
  // ui/reader_view.py's _fitted_font().
  let fontSizePx = options.fontSizePx
  let prefixWidth = 0
  let letterWidth = 0
  let suffixWidth = 0
  for (let pass = 0; pass < 2; pass++) {
    ctx.font = fontString(fontSizePx, fontFamily)
    prefixWidth = ctx.measureText(prefix).width
    letterWidth = ctx.measureText(letter).width
    suffixWidth = ctx.measureText(suffix).width
    const half = letterWidth / 2
    const needLeft = prefixWidth + half
    const needRight = half + suffixWidth
    const scale = Math.min(1, roomLeft / Math.max(needLeft, 0.01), roomRight / Math.max(needRight, 0.01))
    if (scale >= 0.999) break
    const nextSize = Math.max(MIN_FONT_PX, Math.floor(fontSizePx * scale))
    if (nextSize === fontSizePx) break
    fontSizePx = nextSize
  }

  ctx.font = fontString(fontSizePx, fontFamily)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  let x = focusX - prefixWidth - letterWidth / 2

  ctx.fillStyle = textColor
  ctx.fillText(prefix, x, centerY)
  x += prefixWidth

  ctx.fillStyle = orpColor
  ctx.fillText(letter, x, centerY)
  x += letterWidth

  ctx.fillStyle = textColor
  ctx.fillText(suffix, x, centerY)
}
