import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MAX_WPM, MIN_WPM } from '../../core/pacing'
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

/** Reader-only shortcuts: the RSVP transport table and the book-mode
 * paging table from the README, plus P (panel)/B (mode)/Esc (library),
 * which need the engine and reading-mode state that only exist here. */
export function useReaderKeyboardShortcuts(): void {
  const engine = useEngine()
  const navigate = useNavigate()
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)
  const panelOpen = useAppStore((s) => s.panelOpen)
  const setPanelOpen = useAppStore((s) => s.setPanelOpen)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return
      if (event.ctrlKey || event.metaKey) return // handled globally, or not ours

      if (event.key === 'Escape') {
        event.preventDefault()
        navigate('/')
        return
      }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setPanelOpen(!panelOpen)
        return
      }
      if (event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setMode(mode === 'rsvp' ? 'book' : 'rsvp')
        return
      }

      if (mode === 'book') handleBookModeKey(event, engine)
      else handleRsvpModeKey(event, engine)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [engine, navigate, mode, panelOpen, setPanelOpen, setMode])
}

function handleRsvpModeKey(event: KeyboardEvent, engine: ReturnType<typeof useEngine>): void {
  switch (event.key) {
    case ' ':
      event.preventDefault()
      engine.toggle()
      break
    case 'ArrowLeft':
      event.preventDefault()
      engine.skip(event.shiftKey ? -10 : -1)
      break
    case 'ArrowRight':
      event.preventDefault()
      engine.skip(event.shiftKey ? 10 : 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      engine.setWpm(Math.min(MAX_WPM, engine.wpm + 25))
      break
    case 'ArrowDown':
      event.preventDefault()
      engine.setWpm(Math.max(MIN_WPM, engine.wpm - 25))
      break
    case 'Home':
      event.preventDefault()
      engine.seek(0)
      break
    case 'End':
      event.preventDefault()
      engine.seek(engine.count - 1)
      break
  }
}

function handleBookModeKey(event: KeyboardEvent, engine: ReturnType<typeof useEngine>): void {
  switch (event.key) {
    case ' ':
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
      event.preventDefault()
      engine.skip(1)
      break
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      event.preventDefault()
      engine.skip(-1)
      break
    case 'Home':
      event.preventDefault()
      engine.seek(0)
      break
    case 'End':
      event.preventDefault()
      engine.seek(engine.count - 1)
      break
  }
}
