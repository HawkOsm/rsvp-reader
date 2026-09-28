import { DEFAULT_WPM, MAX_WPM, MIN_WPM, delayFor } from './pacing'
import type { Token } from './types'

// Ported from rsvp_engine.py's RsvpEngine. No DOM/React here — this runs in
// a worker, in Vitest and in the UI alike.

export type EngineEventMap = {
  word: number
  playing: boolean
  finished: undefined
}

type Listener<E extends keyof EngineEventMap> = (payload: EngineEventMap[E]) => void

export interface EngineOptions {
  wpm?: number
  index?: number
  /** Defaults to `performance.now`; override in tests. */
  now?: () => number
  /** Defaults to `setTimeout`/`clearTimeout`; override in tests. */
  setTimer?: (cb: () => void, ms: number) => number
  clearTimer?: (id: number) => void
}

export interface Engine {
  readonly tokens: Token[]
  readonly count: number
  readonly index: number
  readonly wpm: number
  readonly isPlaying: boolean
  readonly atEnd: boolean
  currentToken(): Token | null
  progress(): number
  setWpm(wpm: number): void
  play(): void
  pause(): void
  toggle(): void
  seek(index: number): void
  skip(delta: number): void
  on<E extends keyof EngineEventMap>(event: E, listener: Listener<E>): () => void
  destroy(): void
}

export function createEngine(tokens: Token[], options: EngineOptions = {}): Engine {
  const now = options.now ?? (() => performance.now())
  const setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms) as unknown as number)
  const clearTimer = options.clearTimer ?? ((id) => clearTimeout(id))

  const list = tokens
  let index = clamp(options.index ?? 0)
  let wpm = clampWpm(options.wpm ?? DEFAULT_WPM)
  let timerId: number | null = null
  // The absolute time (per `now()`) the pending timer was scheduled to
  // fire at. On tick, the gap between that and the actual fire time is
  // drift (timer coalescing, tab throttling, GC pauses, ...); subtracting
  // it from the next word's delay keeps playback from lagging behind
  // where the WPM rate says it should be, instead of chained setTimeouts
  // silently accumulating lateness word after word.
  let expectedFireTime = 0

  const listeners: { [K in keyof EngineEventMap]: Set<Listener<K>> } = {
    word: new Set(),
    playing: new Set(),
    finished: new Set(),
  }

  function clamp(i: number): number {
    if (list.length === 0) return 0
    return Math.max(0, Math.min(Math.trunc(i), list.length - 1))
  }

  function clampWpm(w: number): number {
    return Math.max(MIN_WPM, Math.min(MAX_WPM, Math.trunc(w)))
  }

  function emit<E extends keyof EngineEventMap>(event: E, payload: EngineEventMap[E]): void {
    for (const listener of listeners[event]) listener(payload)
  }

  function isPlaying(): boolean {
    return timerId !== null
  }

  function stopTimer(): void {
    if (timerId !== null) {
      clearTimer(timerId)
      timerId = null
    }
  }

  function schedule(driftMs = 0): void {
    const token = list[index]
    if (token === undefined) return
    const delay = Math.max(0, delayFor(token, wpm) - driftMs)
    expectedFireTime = now() + delay
    timerId = setTimer(tick, delay)
  }

  function tick(): void {
    timerId = null
    const drift = now() - expectedFireTime
    if (index >= list.length - 1) {
      emit('playing', false)
      emit('finished', undefined)
      return
    }
    index += 1
    emit('word', index)
    schedule(drift)
  }

  function pause(): void {
    if (isPlaying()) {
      stopTimer()
      emit('playing', false)
    }
  }

  function play(): void {
    if (list.length === 0 || isPlaying()) return
    if (index >= list.length - 1) {
      index = 0
      emit('word', index)
    }
    schedule()
    emit('playing', true)
  }

  function seek(i: number): void {
    if (list.length === 0) return
    index = clamp(i)
    emit('word', index)
    if (isPlaying()) {
      stopTimer()
      schedule()
    }
  }

  return {
    tokens: list,
    get count() {
      return list.length
    },
    get index() {
      return index
    },
    get wpm() {
      return wpm
    },
    get isPlaying() {
      return isPlaying()
    },
    get atEnd() {
      return index >= list.length - 1
    },
    currentToken() {
      return list[index] ?? null
    },
    progress() {
      if (list.length === 0) return 0
      return index / list.length
    },
    setWpm(w: number) {
      // Live-adjustable: the next word already uses the new rate. If a
      // word is already mid-hold, re-schedule so the change applies
      // immediately rather than after the current word finishes.
      wpm = clampWpm(w)
      if (isPlaying()) {
        stopTimer()
        schedule()
      }
    },
    play,
    pause,
    toggle() {
      if (isPlaying()) pause()
      else play()
    },
    seek,
    skip(delta: number) {
      seek(index + delta)
    },
    on<E extends keyof EngineEventMap>(event: E, listener: Listener<E>) {
      listeners[event].add(listener)
      return () => listeners[event].delete(listener)
    },
    destroy() {
      stopTimer()
      for (const set of Object.values(listeners)) set.clear()
    },
  }
}
