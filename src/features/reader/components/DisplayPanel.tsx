import { useEffect, useRef, useState } from 'react'
import { FONT_CHOICES, MAX_FONT_SIZE, MIN_FONT_SIZE } from '@/lib/fonts'
import { resolvePalette, type ThemeMode } from '@/lib/theme'
import { useAppStore } from '@/stores/app-store'

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'paper', label: 'Paper' },
]

const SIZE_STEP = 4

const CHOICE = 'rounded-lg border px-2 py-2 text-xs'
const chosen = (on: boolean) =>
  on ? 'border-text font-semibold text-text' : 'border-border text-text-dim hover:text-text'

/** The reader's "Aa" button and the panel it opens: theme, typeface and
 * text size, the settings worth changing mid-book. Saved like any other. */
export function DisplayPanel() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const fontFamily = useAppStore((s) => s.fontFamily)
  const setFontFamily = useAppStore((s) => s.setFontFamily)
  const fontSize = useAppStore((s) => s.fontSize)
  const setFontSize = useAppStore((s) => s.setFontSize)

  // A click anywhere else closes it.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const resize = (size: number) =>
    setFontSize(Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size)))

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Display"
        aria-expanded={open}
        title="Theme, typeface and text size"
        onClick={() => setOpen(!open)}
        className={`h-9 w-10 rounded-lg font-serif text-[15px] font-semibold ${
          open ? 'bg-bg-hover text-text' : 'text-text-dim hover:text-text'
        }`}
      >
        Aa
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Display"
          className="absolute top-11 right-0 z-20 flex w-72 flex-col gap-4 rounded-xl border border-border bg-bg-raised p-4 shadow-xl shadow-black/20"
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xs font-semibold text-text-dim">Theme</legend>
            <div className="grid grid-cols-4 gap-2">
              {THEMES.map(({ value, label }) => {
                const palette = value === 'system' ? null : resolvePalette(value)
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={theme === value}
                    onClick={() => setTheme(value)}
                    style={palette ? { background: palette.bg, color: palette.text } : undefined}
                    className={`${CHOICE} ${chosen(theme === value)}`}
                  >
                    <span className="block font-serif text-base">Aa</span>
                    {label}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xs font-semibold text-text-dim">Typeface</legend>
            <div className="grid grid-cols-3 gap-2">
              {FONT_CHOICES.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={fontFamily === value}
                  onClick={() => setFontFamily(value)}
                  style={{ fontFamily: value }}
                  className={`${CHOICE} ${chosen(fontFamily === value)}`}
                >
                  {label.split(' ')[0]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-text-dim">Text size</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Smaller text"
                onClick={() => resize(fontSize - SIZE_STEP)}
                className="h-9 w-9 rounded-lg border border-border font-serif text-xs text-text"
              >
                A
              </button>
              <input
                type="range"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                value={fontSize}
                onChange={(e) => resize(Number(e.target.value))}
                aria-label="Text size"
                className="min-w-0 flex-1 accent-accent"
              />
              <button
                type="button"
                aria-label="Larger text"
                onClick={() => resize(fontSize + SIZE_STEP)}
                className="h-9 w-9 rounded-lg border border-border font-serif text-lg text-text"
              >
                A
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
