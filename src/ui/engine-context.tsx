/* eslint-disable react-refresh/only-export-components -- a context +
   its hook belong together; splitting into two files just for HMR
   granularity isn't worth the indirection here. */
import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Engine, EngineEventMap } from '../core/engine'

const EngineContext = createContext<Engine | null>(null)

export const EngineProvider = EngineContext.Provider

export function useEngine(): Engine {
  const engine = useContext(EngineContext)
  if (!engine) throw new Error('useEngine must be used within an EngineProvider')
  return engine
}

/** Re-renders only the calling component when `event` fires, returning
 * whatever `read` says the engine's state now is. The token list stays out
 * of React state; each component subscribes to just the value it draws. */
function useEngineValue<E extends keyof EngineEventMap, T>(
  event: E,
  read: (engine: Engine) => T,
): T {
  const engine = useEngine()
  return useSyncExternalStore(
    (onChange) => engine.on(event, onChange),
    () => read(engine),
  )
}

export const useEngineIndex = () => useEngineValue('word', (e) => e.index)
export const useEnginePlaying = () => useEngineValue('playing', (e) => e.isPlaying)
export const useEngineWpm = () => useEngineValue('wpm', (e) => e.wpm)
