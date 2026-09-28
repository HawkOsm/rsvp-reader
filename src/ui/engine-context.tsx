/* eslint-disable react-refresh/only-export-components -- a context +
   its hook belong together; splitting into two files just for HMR
   granularity isn't worth the indirection here. */
import { createContext, useContext } from 'react'
import type { Engine } from '../core/engine'

const EngineContext = createContext<Engine | null>(null)

export const EngineProvider = EngineContext.Provider

export function useEngine(): Engine {
  const engine = useContext(EngineContext)
  if (!engine) throw new Error('useEngine must be used within an EngineProvider')
  return engine
}
