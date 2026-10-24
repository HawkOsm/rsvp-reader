import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearErrorLog,
  formatErrorLog,
  logError,
  logUncaughtErrors,
  MAX_ENTRIES,
  readErrorLog,
} from '@/lib/error-log'

beforeEach(() => {
  clearErrorLog()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('the error log', () => {
  it('records where, what, the stack and the app version', () => {
    logError('import', new Error('bad file'))
    const [entry] = readErrorLog()
    expect(entry).toMatchObject({ where: 'import', message: 'bad file', version: __APP_VERSION__ })
    expect(entry!.stack).toContain('bad file')
  })

  it('accepts things that are not Errors', () => {
    logError('pdf engine', 'stopped')
    expect(readErrorLog()[0]).toMatchObject({ message: 'stopped' })
  })

  it('counts the same error repeated within a second once', () => {
    logError('screen', new Error('loop'))
    logError('screen', new Error('loop'))
    expect(readErrorLog()).toHaveLength(1)
  })

  it(`keeps only the newest ${MAX_ENTRIES}`, () => {
    for (let i = 0; i < MAX_ENTRIES + 5; i++) logError('test', `error ${i}`)
    const log = readErrorLog()
    expect(log).toHaveLength(MAX_ENTRIES)
    expect(log.at(-1)!.message).toBe(`error ${MAX_ENTRIES + 4}`)
  })

  it('formats newest first, and clears', () => {
    logError('a', 'first')
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5000)
    logError('b', 'second')
    const text = formatErrorLog(readErrorLog())
    expect(text.indexOf('second')).toBeLessThan(text.indexOf('first'))
    clearErrorLog()
    expect(readErrorLog()).toEqual([])
  })

  it('never throws, even when storage holds garbage', () => {
    localStorage.setItem('rsvp-reader:errors', 'not json')
    expect(readErrorLog()).toEqual([])
    expect(() => logError('x', 'y')).not.toThrow()
  })

  it('catches errors nothing else caught', () => {
    const stop = logUncaughtErrors()
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('uncaught one') }))
    stop()
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('after stopping') }))
    expect(readErrorLog().map((e) => e.message)).toEqual(['uncaught one'])
  })
})
