import { Fragment, useMemo } from 'react'
import type { PageLine } from '@/features/reader/api/pdf'
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

/** One transparent span per line, and in it one per word, each as wide as
 * the word it covers and as far from the next as on the page. The browser's
 * font is never the PDF's, so without that a selection would not line up
 * with the words underneath: it would cover part of a word, or run on into
 * its neighbours. */
export function PdfTextLayer({ lines, scale }: PdfTextLayerProps) {
  const drawn = useMemo(
    () =>
      lines.map((line) => {
        if (line.words.length === 0) return null
        const left = Math.min(...line.words.map((w) => w.x0)) * scale
        const right = Math.max(...line.words.map((w) => w.x1)) * scale
        const top = Math.min(...line.words.map((w) => w.y0)) * scale
        const bottom = Math.max(...line.words.map((w) => w.y1)) * scale
        const fontSize = Math.max(1, bottom - top)
        const letters = line.words.reduce((n, w) => n + w.text.length, line.words.length - 1)
        // A line far taller than it is wide is text running down the page
        // (a rotated or vertical page). One horizontal span cannot sit
        // over it, so it is left out of the selectable text rather than
        // drawn as a mess.
        if (letters > 2 && right - left < (bottom - top) * 0.5) return null
        // Laid out left to right, whatever order the line's words come in.
        const words = [...line.words].sort((a, b) => a.x0 - b.x0)
        return {
          style: { left, top, fontSize },
          words: words.map((word, i) => {
            const natural = textWidth(word.text, fontSize)
            const wanted = (word.x1 - word.x0) * scale
            const next = words[i + 1]
            return {
              text: word.text,
              // Spread (or squeezed) to the width the word has on the page.
              spacing: natural > 0 ? (wanted - natural) / word.text.length : undefined,
              // The space after it, as wide as the gap to the next word.
              gap: next ? (next.x0 - word.x1) * scale : null,
            }
          }),
        }
      }),
    [lines, scale],
  )
  const shown = drawn.filter((line) => line !== null)
  return (
    <div className="pdfTextLayer">
      {shown.map((line, i) => (
        <Fragment key={i}>
          <span className="pdfLine" style={line.style}>
            {line.words.map((word, j) => (
              <Fragment key={j}>
                <span style={{ letterSpacing: word.spacing }}>{word.text}</span>
                {word.gap !== null && (
                  <span
                    className="pdfGap"
                    style={{ width: Math.max(0, word.gap), marginLeft: Math.min(0, word.gap) }}
                  >
                    {' '}
                  </span>
                )}
              </Fragment>
            ))}
          </span>
          {/* Without a break between lines, copying them runs them together. */}
          {i < shown.length - 1 && <br />}
        </Fragment>
      ))}
    </div>
  )
}
