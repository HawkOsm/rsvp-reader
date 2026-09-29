import { useNavigate } from 'react-router-dom'
import { WpmInput } from '../components/WpmInput'
import { useAppStore } from '../store'
import { DARK_PALETTE } from '../theme'

const FONT_CHOICES = [
  { label: 'Inter (default)', value: 'Inter, "Noto Sans", "Liberation Sans", Arial, sans-serif' },
  { label: 'Georgia (serif)', value: 'Georgia, "Times New Roman", serif' },
  { label: 'System UI', value: 'system-ui, sans-serif' },
]

export function SettingsScreen() {
  const navigate = useNavigate()
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const defaultWpm = useAppStore((s) => s.defaultWpm)
  const setDefaultWpm = useAppStore((s) => s.setDefaultWpm)
  const fontFamily = useAppStore((s) => s.fontFamily)
  const setFontFamily = useAppStore((s) => s.setFontFamily)
  const fontSize = useAppStore((s) => s.fontSize)
  const setFontSize = useAppStore((s) => s.setFontSize)
  const orpColor = useAppStore((s) => s.orpColor)
  const setOrpColor = useAppStore((s) => s.setOrpColor)

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-[var(--color-bg)] p-6 text-[var(--color-text)]">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => navigate('/')} className="text-sm text-[var(--color-text-dim)]">
          ← Library
        </button>
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      <section className="flex max-w-md flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Theme
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'dark' | 'light' | 'system')}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg-raised)] px-2 py-1"
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Default WPM (used for newly-opened books)
          <WpmInput
            value={defaultWpm}
            onCommit={setDefaultWpm}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg-raised)] px-2 py-1"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Font family
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg-raised)] px-2 py-1"
          >
            {FONT_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Font size ({fontSize}px)
          <input
            type="range"
            min={28}
            max={96}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
        </label>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={orpColor !== null}
            onChange={(e) => setOrpColor(e.target.checked ? DARK_PALETTE.accent : null)}
          />
          Custom ORP letter color
          {orpColor !== null && (
            <input
              type="color"
              value={orpColor}
              onChange={(e) => setOrpColor(e.target.value)}
              className="h-6 w-10"
            />
          )}
        </label>
      </section>
    </div>
  )
}
