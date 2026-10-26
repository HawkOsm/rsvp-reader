import type { ReactNode } from 'react'
import { Icon } from '@/components/Icon'
import { WpmInput } from '@/components/WpmInput'
import { MAX_WPM, MIN_WPM } from '@/core/pacing'
import { FONT_CHOICES, fontChoiceOf, MAX_FONT_SIZE, MIN_FONT_SIZE } from '@/lib/fonts'
import { ORP_CHOICES, resolvePalette } from '@/lib/theme'
import { useAppStore } from '@/stores/app-store'
import { sizePercent, stepSize, stepWpm, THEMES } from '@/features/settings/settings-values'

// The pieces of the settings screen, shared by its wide and phone layouts.

/** A rounded group of rows, a line between each. */
export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border rounded-[14px] border border-border bg-bg-raised">
      {children}
    </div>
  )
}

/** One setting: its name and a line about it on the left, its control on the right. */
export function Row({
  title,
  hint,
  children,
}: {
  title: ReactNode
  hint?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-[18px] py-3.5">
      <div className="flex min-w-48 flex-1 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {hint && <span className="text-[13px] text-text-dim">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** The four themes as small pages of themselves. */
export function ThemePicker() {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  return (
    <div role="group" aria-label="Theme" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {THEMES.map(({ value, label }) => {
        const p = resolvePalette(value)
        return (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => setTheme(value)}
            className={`flex flex-col gap-2 rounded-xl p-2.5 text-left ${
              theme === value ? 'border-2 border-accent' : 'border border-border'
            }`}
          >
            {/* The theme's own colours, so each card shows what it gives. */}
            <span
              aria-hidden
              className="flex h-16 items-center justify-center rounded-lg font-serif text-xl"
              style={{ background: p.bg, color: p.text, boxShadow: `inset 0 0 0 1px ${p.border}` }}
            >
              r<span style={{ color: p.accent }}>e</span>ad
            </span>
            <span className="text-[13px] font-medium">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** The focus letter's colour: the theme's accent, or one picked here. */
export function FocusLetterSwatches() {
  const orpColor = useAppStore((s) => s.orpColor)
  const setOrpColor = useAppStore((s) => s.setOrpColor)
  const accent = resolvePalette(useAppStore((s) => s.theme)).accent
  const choices = [{ label: 'Theme accent', hex: null as string | null }, ...ORP_CHOICES]
  return (
    <div role="group" aria-label="Focus letter colour" className="flex gap-2">
      {choices.map(({ label, hex }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          aria-pressed={orpColor === hex}
          onClick={() => setOrpColor(hex)}
          className={`h-8 w-8 rounded-full border-2 ${
            orpColor === hex ? 'border-text' : 'border-transparent'
          }`}
          // A swatch is the colour it picks: data, not a theme colour.
          style={{ background: hex ?? accent }}
        />
      ))}
    </div>
  )
}

/** A word as the reader will flash it: typeface, size and focus colour. */
export function WordPreview({ scale = 1 }: { scale?: number }) {
  const fontFamily = useAppStore((s) => s.fontFamily)
  const fontSize = useAppStore((s) => s.fontSize)
  const orpColor = useAppStore((s) => s.orpColor)
  const accent = resolvePalette(useAppStore((s) => s.theme)).accent
  return (
    <div
      aria-label="Preview"
      role="img"
      className="relative flex h-[150px] flex-col justify-center overflow-hidden rounded-[10px] bg-bg"
    >
      <span aria-hidden className="absolute top-6 left-[42%] -ml-px h-3 w-0.5 bg-guide" />
      <span aria-hidden className="absolute bottom-6 left-[42%] -ml-px h-3 w-0.5 bg-guide" />
      <div
        aria-hidden
        className="grid grid-cols-[42fr_auto_58fr] items-baseline leading-none font-medium whitespace-pre"
        style={{ fontFamily, fontSize: Math.round(fontSize * scale) }}
      >
        <span className="text-right">re</span>
        <span style={{ color: orpColor ?? accent }}>a</span>
        <span>ding</span>
      </div>
    </div>
  )
}

/** Inter / Georgia / System, side by side. */
export function TypefacePicker() {
  const fontFamily = useAppStore((s) => s.fontFamily)
  const setFontFamily = useAppStore((s) => s.setFontFamily)
  const current = fontChoiceOf(fontFamily)
  return (
    <div
      role="group"
      aria-label="Typeface"
      className="flex h-9 rounded-[10px] border border-border bg-bg p-[3px]"
    >
      {FONT_CHOICES.map((choice) => (
        <button
          key={choice.value}
          type="button"
          aria-pressed={current === choice}
          onClick={() => setFontFamily(choice.value)}
          className={`rounded-[7px] px-3.5 text-[13px] ${
            current === choice ? 'bg-bg-hover text-text' : 'text-text-dim hover:text-text'
          }`}
          style={{ fontFamily: choice.value }}
        >
          {choice.short}
        </button>
      ))}
    </div>
  )
}

/** Smaller and larger buttons with how big the word is between them. */
export function WordSizeControl() {
  const fontSize = useAppStore((s) => s.fontSize)
  const setFontSize = useAppStore((s) => s.setFontSize)
  const BUTTON = 'h-9 w-9 rounded-[9px] border border-border disabled:opacity-40'
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        aria-label="Smaller"
        disabled={fontSize <= MIN_FONT_SIZE}
        onClick={() => setFontSize(stepSize(fontSize, -1))}
        className={`${BUTTON} text-xs`}
      >
        A
      </button>
      <div className="hidden h-1 w-40 rounded-full bg-border sm:block" aria-hidden>
        <div
          className="h-1 rounded-full bg-accent"
          style={{ width: `${sizePercent(fontSize)}%` }}
        />
      </div>
      <button
        type="button"
        aria-label="Larger"
        disabled={fontSize >= MAX_FONT_SIZE}
        onClick={() => setFontSize(stepSize(fontSize, 1))}
        className={`${BUTTON} text-[17px]`}
      >
        A
      </button>
      <span className="w-12 text-right text-[13px] text-text-dim tabular-nums">{fontSize}px</span>
    </div>
  )
}

/** The speed a book starts at the first time it is opened. */
export function StartingSpeedControl() {
  const wpm = useAppStore((s) => s.defaultWpm)
  const setWpm = useAppStore((s) => s.setDefaultWpm)
  const STEP = 'h-8 w-[34px] rounded-lg text-[17px] hover:bg-bg-hover disabled:opacity-40'
  return (
    <div
      role="group"
      aria-label="Starting speed"
      className="flex h-10 items-center rounded-[11px] border border-border bg-bg p-[3px]"
    >
      <button
        type="button"
        aria-label="Slower"
        disabled={wpm <= MIN_WPM}
        onClick={() => setWpm(stepWpm(wpm, -1))}
        className={STEP}
      >
        −
      </button>
      <span className="flex min-w-[84px] items-baseline justify-center gap-1 tabular-nums">
        <WpmInput
          value={wpm}
          onCommit={setWpm}
          className="w-11 bg-transparent text-center font-semibold"
        />
        <span className="text-xs text-text-dim">wpm</span>
      </span>
      <button
        type="button"
        aria-label="Faster"
        disabled={wpm >= MAX_WPM}
        onClick={() => setWpm(stepWpm(wpm, 1))}
        className={STEP}
      >
        +
      </button>
    </div>
  )
}

/** A row on the phone's settings list: a name, its value, and where it leads. */
export function LinkRow({
  title,
  value,
  onClick,
}: {
  title: string
  value?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[50px] w-full items-center gap-3 px-3.5 text-left"
    >
      <span className="flex-1">{title}</span>
      {value !== undefined && <span className="text-text-dim">{value}</span>}
      <span className="text-guide">
        <Icon name="chevron" size={16} />
      </span>
    </button>
  )
}
