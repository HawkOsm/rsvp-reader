import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isTypingTarget } from '@/lib/keyboard'

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
