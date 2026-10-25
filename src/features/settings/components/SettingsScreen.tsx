import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { CONTROL, Field } from '@/components/Field'
import { Page } from '@/components/Page'
import { WpmInput } from '@/components/WpmInput'
import { ErrorLogSection } from './ErrorLogSection'
import { ExperimentalFlags } from './ExperimentalFlags'
import { useAppStore } from '@/stores/app-store'
import { FONT_CHOICES, MAX_FONT_SIZE, MIN_FONT_SIZE } from '@/lib/fonts'
import { DARK_PALETTE, type ThemeMode } from '@/lib/theme'

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
  const showHints = useAppStore((s) => s.showHints)
  const setShowHints = useAppStore((s) => s.setShowHints)

  return (
    <Page
      title="Settings"
      back={
        <Button variant="link" onClick={() => navigate('/')}>
          ← Library
        </Button>
      }
    >
      <section className="flex max-w-md flex-col gap-4">
        <Field label="Theme">
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeMode)}
            className={CONTROL}
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="paper">Paper</option>
          </select>
        </Field>

        <Field label="Default WPM (used for newly-opened books)">
          <WpmInput
            value={defaultWpm}
            onCommit={setDefaultWpm} // Check the WpmInput component for details on how this works
            className={CONTROL}
          />
        </Field>

        <Field label="Font family">
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className={CONTROL}
          >
            {FONT_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Font size (${fontSize}px)`}>
          <input
            type="range"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
        </Field>

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

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={showHints}
            onChange={(e) => setShowHints(e.target.checked)}
          />
          Show keyboard hints in the reader
        </label>
      </section>

      <ExperimentalFlags />

      <ErrorLogSection />

      <section className="mt-8 flex max-w-xl flex-col gap-2 border-t border-border pt-4 text-sm text-text-dim">
        <h2 className="text-base font-medium text-text">About and licences</h2>
        <p>
          RSVP Reader is free software under the GNU General Public License, version 3 or (at your
          option) any later version. Its source code is at{' '}
          <a
            className="underline"
            href="https://github.com/HawkOsm/rsvp-reader"
            target="_blank"
            rel="noreferrer"
          >
            github.com/HawkOsm/rsvp-reader
          </a>
          .
        </p>
        <p>
          PDFs are read and drawn by{' '}
          <a className="underline" href="https://mupdf.com" target="_blank" rel="noreferrer">
            MuPDF
          </a>
          , © Artifex Software, under the GNU Affero General Public License, version 3 or later
          (source:{' '}
          <a
            className="underline"
            href="https://github.com/ArtifexSoftware/mupdf.js"
            target="_blank"
            rel="noreferrer"
          >
            github.com/ArtifexSoftware/mupdf.js
          </a>
          ). Scanned pages are recognised with Tesseract (Apache License 2.0). The full list is in{' '}
          <code>docs/THIRD_PARTY.md</code> in the source.
        </p>
      </section>
    </Page>
  )
}
