import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { logError } from '@/lib/error-log'
import { isTypingTarget } from '@/lib/keyboard'
import { getPlatform } from '@/platform'

/** Ctrl/Cmd+L and F11: work on every screen, not just the reader — mounted
 * once, at the app root. */
export function useGlobalShortcuts(): void {
  const navigate = useNavigate()
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'F11') {
        // Left to the browser where it has its own full screen.
        void getPlatform()
          .then((platform) => platform.toggleFullScreen?.())
          .catch((err: unknown) => logError('full screen', err))
        return
      }
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
