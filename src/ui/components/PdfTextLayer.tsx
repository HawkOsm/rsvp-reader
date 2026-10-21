import { Fragment, useMemo } from 'react'
import type { PageLine } from '../../pdf/document'
import './pdf-text-layer.css'

interface PdfTextLayerProps {
  lines: PageLine[]
  /** CSS pixels per PDF point. */
  scale: number
}

let measurer: CanvasRenderingContext2D | null | undefined

/** How wide `text` comes out in the browser's default font at `fontSize`. */
function textWidth(text: string, fontSize: number): number {
  if (measurer === undefined) measurer = document.createElement('canvas').getContext('2d')
  if (!measurer) return 0
  measurer.font = `${fontSize}px sans-serif`
  return measurer.measureText(text).width
}

/** One transparent span per line, each stretched to the width of the line
 * it covers — the browser's font is never the PDF's, so without the stretch
 * a selection would not line up with the words underneath. */
export function PdfTextLayer({ lines, scale }: PdfTextLayerProps) {
  const spans = useMemo(
    () =>
      lines.map((line) => {
        if (line.words.length === 0) return null
        const left = Math.min(...line.words.map((w) => w.x0)) * scale
        const right = Math.max(...line.words.map((w) => w.x1)) * scale
        const top = Math.min(...line.words.map((w) => w.y0)) * scale
        const bottom = Math.max(...line.words.map((w) => w.y1)) * scale
        const text = line.words.map((w) => w.text).join(' ')
        const fontSize = Math.max(1, bottom - top)
        // A line far taller than it is wide is text running down the page
        // (a rotated or vertical page). One horizontal span cannot sit
        // over it, so it is left out of the selectable text rather than
        // drawn as a mess.
        if (text.length > 2 && right - left < (bottom - top) * 0.5) return null
        const natural = textWidth(text, fontSize)
        const wanted = right - left
        return {
          text,
          style: {
            left,
            top,
            fontSize,
            transform: natural > 0 ? `scaleX(${wanted / natural})` : undefined,
          },
        }
      }),
    [lines, scale],
  )
  const shown = spans.filter((span) => span !== null)
  return (
    <div className="pdfTextLayer">
      {shown.map((span, i) => (
        <Fragment key={i}>
          <span style={span.style}>{span.text}</span>
          {/* Without a break between lines, copying them runs them together. */}
          {i < shown.length - 1 && <br />}
        </Fragment>
      ))}
    </div>
  )
}
