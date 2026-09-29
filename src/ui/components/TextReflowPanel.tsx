import { useEffect, useMemo, useState } from 'react'
import { useEngine, useEngineIndex } from '../engine-context'

/** How many tokens on either side of the current word to actually render
 * as DOM spans. A 200k-word book as one giant flow of per-word <span>s
 * would be a lot of DOM for the browser to lay out; a bounded window
 * re-centered as the reader progresses keeps this cheap while still
 * reading as continuous text. */
const WINDOW_RADIUS = 1500
const RECENTER_THRESHOLD = 400

export function TextReflowPanel() {
  const engine = useEngine()
  const index = useEngineIndex()
  const [windowCenter, setWindowCenter] = useState(engine.index)

  // Re-center the rendered window once the reader drifts far from its middle.
  useEffect(() => {
    setWindowCenter((center) => (Math.abs(index - center) > RECENTER_THRESHOLD ? index : center))
  }, [index])

  const start = Math.max(0, windowCenter - WINDOW_RADIUS)
  const end = Math.min(engine.count, windowCenter + WINDOW_RADIUS)

  const paragraphs = useMemo(() => {
    const groups: { startIndex: number; words: { text: string; index: number }[] }[] = []
    let current: { startIndex: number; words: { text: string; index: number }[] } | null = null
    for (let i = start; i < end; i++) {
      const token = engine.tokens[i]
      if (!token) continue
      if (!current) current = { startIndex: i, words: [] }
      current.words.push({ text: token.text, index: i })
      if (token.paraEnd) {
        groups.push(current)
        current = null
      }
    }
    if (current) groups.push(current)
    return groups
  }, [engine, start, end])

  return (
    <div
      className="h-full overflow-y-auto p-6 text-[var(--color-text)]"
      style={{ columnWidth: '32rem', columnGap: '3rem' }}
    >
      {paragraphs.map((paragraph) => (
        <p key={paragraph.startIndex} className="mb-4 leading-relaxed break-inside-avoid-column">
          {paragraph.words.map((word, i) => (
            <span key={word.index}>
              <span
                onClick={() => engine.seek(word.index)}
                className={
                  word.index === index
                    ? 'cursor-pointer rounded bg-[var(--color-accent)] px-0.5 text-[var(--color-bg)]'
                    : 'cursor-pointer'
                }
              >
                {word.text}
              </span>
              {i < paragraph.words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      ))}
    </div>
  )
}
