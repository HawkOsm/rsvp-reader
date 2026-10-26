import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon, type IconName } from '@/components/Icon'
import { Page } from '@/components/Page'
import { PhoneTabBar } from '@/components/PhoneTabBar'
import { Switch } from '@/components/Switch'
import { storageSummary, type StorageSummary } from '@/features/settings/api/storage'
import { logError } from '@/lib/error-log'
import { fontName } from '@/lib/fonts'
import { useFlag } from '@/lib/flags'
import { formatBytes } from '@/lib/format'
import { useMediaQuery, WIDE } from '@/lib/media'
import type { ThemeMode } from '@/lib/theme'
import { useAppStore } from '@/stores/app-store'
import { THEMES } from '@/features/settings/settings-values'
import { ErrorLogSection } from './ErrorLogSection'
import { ExperimentalFlags } from './ExperimentalFlags'
import { SyncSection } from './SyncSection'
import {
  Card,
  FocusLetterSwatches,
  LinkRow,
  Row,
  StartingSpeedControl,
  ThemePicker,
  TypefacePicker,
  WordPreview,
  WordSizeControl,
} from './SettingsControls'

const SECTIONS: { id: string; label: string; icon: IconName }[] = [
  { id: 'appearance', label: 'Appearance', icon: 'sun' },
  { id: 'reading', label: 'Reading', icon: 'book' },
  { id: 'data', label: 'Library & data', icon: 'drive' },
  { id: 'sync', label: 'Sync', icon: 'sync' },
  { id: 'advanced', label: 'Advanced', icon: 'flask' },
  { id: 'about', label: 'About', icon: 'info' },
]

/** A phone shows settings as a list, and some of them on a page of their own. */
const PHONE_PAGE_TITLES = {
  reading: 'Word display',
  experimental: 'Experimental',
  errors: 'Error log',
  about: 'About and licences',
}
type PhonePage = keyof typeof PHONE_PAGE_TITLES

export function SettingsScreen() {
  const wide = useMediaQuery(WIDE)
  const [search] = useSearchParams()
  const [storage, setStorage] = useState<StorageSummary | null>(null)
  useEffect(() => {
    storageSummary()
      .then(setStorage)
      .catch((err) => logError('storage summary', err))
  }, [])

  if (wide) return <WideSettings storage={storage} />
  const page = search.get('page')
  if (page !== null && page in PHONE_PAGE_TITLES) {
    return <PhoneSubpage page={page as PhonePage} />
  }
  return <PhoneSettings storage={storage} />
}

function WideSettings({ storage }: { storage: StorageSummary | null }) {
  const navigate = useNavigate()
  const showHints = useAppStore((s) => s.showHints)
  const setShowHints = useAppStore((s) => s.setShowHints)
  const orpColor = useAppStore((s) => s.orpColor)
  const setOrpColor = useAppStore((s) => s.setOrpColor)
  const sync = useFlag('sync')

  return (
    <Page
      title="Settings"
      sidebar={
        <aside className="flex min-w-0 flex-[1_1_13rem] flex-col gap-5 border-r border-border bg-bg-raised/40 px-3.5 py-5 sm:min-h-screen sm:max-w-64">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex min-h-10 items-center gap-1.5 self-start rounded-lg pr-2.5 pl-1.5 text-text-dim hover:bg-bg-hover hover:text-text"
          >
            <Icon name="back" />
            Library
          </button>
          <nav aria-label="Settings sections" className="flex flex-col gap-0.5">
            {SECTIONS.filter(({ id }) => sync || id !== 'sync').map(({ id, label, icon }) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={(e) => {
                  // The app's router owns the hash, so scroll rather than follow it.
                  e.preventDefault()
                  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-text-dim hover:bg-bg-hover hover:text-text"
              >
                <Icon name={icon} size={18} />
                {label}
              </a>
            ))}
          </nav>
        </aside>
      }
    >
      <div className="flex max-w-[860px] flex-col gap-9">
        <Section id="appearance" title="Appearance">
          <Card>
            <div className="flex flex-col gap-3 px-[18px] py-4">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">Theme</span>
                <span className="text-[13px] text-text-dim">
                  System follows your device’s light or dark setting.
                </span>
              </div>
              <ThemePicker />
            </div>
            <Row
              title="Focus letter colour"
              hint="The highlighted letter in each word. Off uses the theme’s accent."
            >
              {orpColor !== null && <FocusLetterSwatches />}
              <Switch
                label="Custom focus letter colour"
                checked={orpColor !== null}
                onChange={(on) => setOrpColor(on ? '#5aa9ff' : null)}
              />
            </Row>
            <Row title="Keyboard hints" hint="The row of shortcuts under the reader’s controls.">
              <Switch
                label="Show keyboard hints in the reader"
                checked={showHints}
                onChange={setShowHints}
              />
            </Row>
          </Card>
        </Section>

        <Section id="reading" title="Reading">
          <Card>
            <div className="px-[18px] py-4">
              <WordPreview />
            </div>
            <Row title="Typeface" hint="For the flashed word.">
              <TypefacePicker />
            </Row>
            <Row title="Word size" hint="Long words shrink to fit the screen.">
              <WordSizeControl />
            </Row>
            <Row
              title="Starting speed"
              hint="For books you haven’t opened yet. Each book remembers its own."
            >
              <StartingSpeedControl />
            </Row>
          </Card>
        </Section>

        <Section id="data" title="Library & data">
          <Card>
            <StorageRow storage={storage} />
          </Card>
        </Section>

        {sync && (
          <Section id="sync" title="Sync">
            <Card>
              <SyncSection />
            </Card>
          </Section>
        )}

        <Section id="advanced" title="Advanced">
          <Card>
            <ExperimentalFlags />
            <ErrorLogSection />
          </Card>
        </Section>

        <Section id="about" title="About">
          <Card>
            <div className="flex justify-between gap-4 px-[18px] py-3.5">
              <span className="font-medium">Version</span>
              <span className="text-text-dim">{__APP_VERSION__}</span>
            </div>
            <Licences />
          </Card>
        </Section>
      </div>
    </Page>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="flex scroll-mt-6 flex-col gap-3">
      <h2 id={`${id}-heading`} className="text-[17px] font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

function StorageRow({ storage, phone }: { storage: StorageSummary | null; phone?: boolean }) {
  const sync = useFlag('sync')
  const size = storage?.usageBytes != null ? formatBytes(storage.usageBytes) : null
  const books = storage ? `${storage.books} ${storage.books === 1 ? 'book' : 'books'}` : null
  return (
    <div className="flex flex-col gap-2.5 px-[18px] py-3.5">
      <div className="flex justify-between gap-4">
        <span className="font-medium">{phone ? 'On this device' : 'Stored on this device'}</span>
        <span className="text-text-dim tabular-nums">
          {[size, phone ? null : books].filter(Boolean).join(' · ')}
        </span>
      </div>
      {storage?.fraction != null && (
        <div className="h-1.5 rounded-full bg-border" aria-hidden>
          <div
            className="h-1.5 rounded-full bg-text-dim"
            style={{ width: `${Math.max(1, Math.min(100, storage.fraction * 100))}%` }}
          />
        </div>
      )}
      {!phone && (
        <span className="text-[13px] text-text-dim">
          {sync
            ? 'Your books stay on this device; see Sync for what goes to Google Drive.'
            : 'No account and no sync. Your books and reading positions never leave this device.'}
          {storage?.persisted && ' The browser has agreed not to clear them.'}
        </span>
      )}
    </div>
  )
}

function Licences() {
  const link = 'text-text underline'
  return (
    <div className="flex flex-col gap-1.5 px-[18px] py-3.5 text-[13px] leading-relaxed text-text-dim">
      <span className="text-sm font-medium text-text">Licences</span>
      <span>
        RSVP Reader is free software under the GNU General Public License, version 3 or (at your
        option) any later version. Source:{' '}
        <a
          className={link}
          href="https://github.com/HawkOsm/rsvp-reader"
          target="_blank"
          rel="noreferrer"
        >
          github.com/HawkOsm/rsvp-reader
        </a>
      </span>
      <span>
        PDFs are read and drawn by{' '}
        <a className={link} href="https://mupdf.com" target="_blank" rel="noreferrer">
          MuPDF
        </a>
        , © Artifex Software, under the GNU Affero General Public License, version 3 or later
        (source:{' '}
        <a
          className={link}
          href="https://github.com/ArtifexSoftware/mupdf.js"
          target="_blank"
          rel="noreferrer"
        >
          github.com/ArtifexSoftware/mupdf.js
        </a>
        ). Scanned pages are recognised with Tesseract (Apache License 2.0). The full list is in{' '}
        <code>docs/THIRD_PARTY.md</code> in the source.
      </span>
    </div>
  )
}

/** A heading over a phone settings group. */
function PhoneGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="mx-3.5 text-xs font-semibold tracking-wider text-text-dim uppercase">
        {title}
      </h2>
      <div className="divide-y divide-border rounded-[14px] bg-bg-raised">{children}</div>
    </section>
  )
}

function PhoneSettings({ storage }: { storage: StorageSummary | null }) {
  const navigate = useNavigate()
  const [, setSearch] = useSearchParams()
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const showHints = useAppStore((s) => s.showHints)
  const setShowHints = useAppStore((s) => s.setShowHints)
  const fontFamily = useAppStore((s) => s.fontFamily)
  const fontSize = useAppStore((s) => s.fontSize)
  const wpm = useAppStore((s) => s.defaultWpm)
  const sync = useFlag('sync')
  const open = (page: PhonePage) => setSearch({ page })

  return (
    <Page
      title="Settings"
      tabBar={
        <PhoneTabBar
          active="settings"
          onSelect={(tab) => {
            if (tab === 'library') navigate('/')
            if (tab === 'shelves') navigate('/?tab=shelves')
          }}
        />
      }
    >
      <div className="-mx-2 flex flex-col gap-5">
        <PhoneGroup title="Appearance">
          <label className="flex min-h-[50px] items-center gap-3 px-3.5">
            <span className="flex-1">Theme</span>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as ThemeMode)}
              className="bg-transparent text-right text-text-dim outline-none"
            >
              {THEMES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex min-h-[50px] items-center gap-3 px-3.5">
            <span className="flex-1">Keyboard hints</span>
            <Switch
              label="Show keyboard hints in the reader"
              checked={showHints}
              onChange={setShowHints}
            />
          </div>
        </PhoneGroup>

        <PhoneGroup title="Reading">
          <LinkRow
            title="Word display"
            value={`${fontName(fontFamily)} · ${fontSize} px`}
            onClick={() => open('reading')}
          />
          <LinkRow title="Starting speed" value={`${wpm} wpm`} onClick={() => open('reading')} />
        </PhoneGroup>

        <div className="flex flex-col gap-2">
          <PhoneGroup title="Library & data">
            <StorageRow storage={storage} phone />
          </PhoneGroup>
          <p className="mx-3.5 text-xs leading-snug text-text-dim">
            {sync
              ? 'Your books stay on this device.'
              : 'No account, no sync. Your books never leave this device.'}
          </p>
        </div>

        {sync && (
          <PhoneGroup title="Sync">
            <SyncSection />
          </PhoneGroup>
        )}

        <PhoneGroup title="More">
          <LinkRow title="Experimental" onClick={() => open('experimental')} />
          <LinkRow title="Error log" onClick={() => open('errors')} />
          <LinkRow
            title="About and licences"
            value={__APP_VERSION__}
            onClick={() => open('about')}
          />
        </PhoneGroup>
      </div>
    </Page>
  )
}

function PhoneSubpage({ page }: { page: PhonePage }) {
  const navigate = useNavigate()
  return (
    <Page
      title={PHONE_PAGE_TITLES[page]}
      back={
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="-ml-2 flex min-h-11 items-center gap-0.5 text-accent"
        >
          <Icon name="back" size={20} />
          Settings
        </button>
      }
    >
      <div className="-mx-2 flex flex-col gap-5">
        {page === 'reading' && (
          <>
            <WordPreview />
            <PhoneGroup title="Typeface">
              <div className="px-3.5 py-3">
                <TypefacePicker />
              </div>
            </PhoneGroup>
            <div className="flex flex-col gap-2">
              <PhoneGroup title="Size and speed">
                <Row title="Word size">
                  <WordSizeControl />
                </Row>
                <Row title="Starting speed">
                  <StartingSpeedControl />
                </Row>
              </PhoneGroup>
              <p className="mx-3.5 text-xs leading-snug text-text-dim">
                Starting speed is for books you haven’t opened yet. Each book remembers its own.
              </p>
            </div>
            <PhoneGroup title="Focus letter">
              <div className="px-3.5 py-3.5">
                <FocusLetterSwatches />
              </div>
            </PhoneGroup>
          </>
        )}
        {page === 'experimental' && (
          <Card>
            <ExperimentalFlags />
          </Card>
        )}
        {page === 'errors' && (
          <Card>
            <ErrorLogSection />
          </Card>
        )}
        {page === 'about' && (
          <Card>
            <div className="flex justify-between gap-4 px-[18px] py-3.5">
              <span className="font-medium">Version</span>
              <span className="text-text-dim">{__APP_VERSION__}</span>
            </div>
            <Licences />
          </Card>
        )}
      </div>
    </Page>
  )
}
