import { useSyncExternalStore } from 'react'

// Feature flags: unfinished work is merged switched off, so `main` is always
// releasable and the build you read with is never half a feature. A flag is
// switched on per device, from Settings → Experimental, for trying the work
// out; it never changes for anyone else. Delete a flag (and its `if`s) when
// the feature is finished. See docs/architecture/principles.md.

export interface FlagInfo {
  /** What turning it on does, shown in Settings. */
  description: string
}

/** Every flag that exists. Add one here before writing the code it guards. */
export const FLAGS = {} as const satisfies Record<string, FlagInfo>

export type Flag = keyof typeof FLAGS

const STORAGE_KEY = 'rsvp-reader:flags'

/** Flags over a registry and a storage, so tests can use their own. */
export function createFlags<F extends string>(
  registry: Record<F, FlagInfo>,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
) {
  const listeners = new Set<() => void>()
  let enabled = read()

  function read(): ReadonlySet<F> {
    try {
      const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '[]') as unknown
      // A flag that was removed from the registry is forgotten, not kept on.
      return new Set((Array.isArray(saved) ? saved : []).filter((f): f is F => f in registry))
    } catch {
      return new Set()
    }
  }

  return {
    registry,
    isEnabled: (flag: F) => enabled.has(flag),
    /** The flags that are on; a new set whenever one changes. */
    snapshot: (): ReadonlySet<F> => enabled,
    setEnabled(flag: F, on: boolean) {
      const next = new Set(enabled)
      if (on) next.add(flag)
      else next.delete(flag)
      enabled = next
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify([...next]))
      } catch {
        // Storage refused (private mode): the flag still holds until reload.
      }
      listeners.forEach((listener) => listener())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export const flags = createFlags<Flag>(FLAGS, browserStorage())

/** Whether `flag` is on, re-rendering when it is switched. */
export function useFlag(flag: Flag): boolean {
  return useSyncExternalStore(flags.subscribe, flags.snapshot).has(flag)
}
