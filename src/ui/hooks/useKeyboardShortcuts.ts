import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { SCALE_STEP, goToPage, scrollOrTurn, turn } from '../book-nav'
import { useEngine } from '../engine-context'
import { useAppStore } from '../store'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

/** Ctrl/Cmd+L: works on every screen, not just the reader — mounted once,
 * at the app root. */
export function useGlobalShortcuts(): void {
  const navigate = useNavigate()
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        navigate('/')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])
}

type Keys = Record<string, (event: KeyboardEvent) => void>

/** One handler under several key names. */
function bind(names: string[], handler: Keys[string]): Keys {
  return Object.fromEntries(names.map((name) => [name, handler]))
}

/** Reader-only shortcuts, from the README's tables: one key map per reading
 * mode, plus P (panel), B (mode) and Esc (library), which need the
 * reading-mode state that only exists here. */
export function useReaderKeyboardShortcuts(pageCount?: number): void {
  const engine = useEngine()
  const navigate = useNavigate()
  const {
    mode,
    setMode,
    panelOpen,
    setPanelOpen,
    bookLayout,
    setBookLayout,
    stepBookScale,
    fitBook,
  } = useAppStore()

  useEffect(() => {
    const last = engine.count - 1
    const onward = () => engine.skip(1)
    const back = () => engine.skip(-1)

    let modeKeys: Keys
    if (mode === 'rsvp') {
      modeKeys = {
        ' ': () => engine.toggle(),
        ArrowLeft: (e) => engine.skip(e.shiftKey ? -10 : -1),
        ArrowRight: (e) => engine.skip(e.shiftKey ? 10 : 1),
        ArrowUp: () => engine.setWpm(engine.wpm + 25),
        ArrowDown: () => engine.setWpm(engine.wpm - 25),
        Home: () => engine.seek(0),
        End: () => engine.seek(last),
        p: () => setPanelOpen(!panelOpen),
      }
    } else if (pageCount !== undefined) {
      // Book mode over a PDF: turn pages, scrolling a tall page first.
      modeKeys = {
        ...bind(['+', '='], () => stepBookScale(SCALE_STEP)),
        '-': () => stepBookScale(-SCALE_STEP),
        ...bind([' ', 'ArrowRight', 'ArrowDown'], () => scrollOrTurn(engine, pageCount, bookLayout, 1)),
        ...bind(['ArrowLeft', 'ArrowUp'], () => scrollOrTurn(engine, pageCount, bookLayout, -1)),
        PageDown: () => turn(engine, pageCount, bookLayout, 1),
        PageUp: () => turn(engine, pageCount, bookLayout, -1),
        Home: () => goToPage(engine, pageCount, bookLayout, 0),
        End: () => goToPage(engine, pageCount, bookLayout, pageCount - 1),
        d: () => setBookLayout(bookLayout === 'spread' ? 'single' : 'spread'),
        f: fitBook,
      }
    } else {
      // Book mode over reflowed text has no pages, so keys step words.
      modeKeys = {
        ...bind([' ', 'ArrowRight', 'ArrowDown', 'PageDown'], onward),
        ...bind(['ArrowLeft', 'ArrowUp', 'PageUp'], back),
        Home: () => engine.seek(0),
        End: () => engine.seek(last),
      }
    }

    const keys: Keys = {
      ...modeKeys,
      Escape: () => navigate('/'),
      b: () => setMode(mode === 'rsvp' ? 'book' : 'rsvp'),
    }

    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return
      if (event.ctrlKey || event.metaKey) return // handled globally, or not ours
      const handler = keys[event.key.length === 1 ? event.key.toLowerCase() : event.key]
      if (!handler) return
      event.preventDefault()
      handler(event)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    engine,
    navigate,
    mode,
    setMode,
    panelOpen,
    setPanelOpen,
    pageCount,
    bookLayout,
    setBookLayout,
    stepBookScale,
    fitBook,
  ])
}
