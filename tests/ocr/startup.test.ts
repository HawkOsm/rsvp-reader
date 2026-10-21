import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExtractionError } from '../../src/parse/errors'
import { startGuarded } from '../../src/ocr/startup'

function fakeWorker() {
  return { terminate: vi.fn(async () => {}) }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('startGuarded', () => {
  it('returns the worker when it starts', async () => {
    const worker = fakeWorker()
    await expect(startGuarded(async () => worker)).resolves.toBe(worker)
    expect(worker.terminate).not.toHaveBeenCalled()
  })

  it('reports an error sent to the error handler, which is how a bad language file shows up', async () => {
    // tesseract.js never settles the promise in this case.
    const starting = startGuarded((onError) => {
      onError(new Error('fetch failed'))
      return new Promise(() => {})
    })
    await expect(starting).rejects.toBeInstanceOf(ExtractionError)
    await expect(starting).rejects.toThrow(/fetch failed/)
  })

  it('accepts a plain string from the error handler', async () => {
    const starting = startGuarded((onError) => {
      onError('Error opening data file')
      return new Promise(() => {})
    })
    await expect(starting).rejects.toThrow(/Error opening data file/)
  })

  it('gives up after the timeout instead of waiting for ever', async () => {
    const starting = startGuarded(() => new Promise(() => {}), { timeoutMs: 5000 })
    const assertion = expect(starting).rejects.toThrow(/too long/)
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
  })

  it('does not time out once started', async () => {
    const worker = fakeWorker()
    const starting = startGuarded(async () => worker, { timeoutMs: 5000 })
    await expect(starting).resolves.toBe(worker)
    await vi.advanceTimersByTimeAsync(10_000) // nothing left to fire
  })

  it('stops waiting when cancelled', async () => {
    const controller = new AbortController()
    const starting = startGuarded(() => new Promise(() => {}), { signal: controller.signal })
    controller.abort()
    await expect(starting).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('does not start at all when already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const start = vi.fn(async () => fakeWorker())
    await expect(startGuarded(start, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(start).not.toHaveBeenCalled()
  })

  it('shuts down a worker that finishes starting after the start was abandoned', async () => {
    const worker = fakeWorker()
    let finish: (w: typeof worker) => void = () => {}
    const controller = new AbortController()
    const starting = startGuarded(
      () => new Promise<typeof worker>((resolve) => (finish = resolve)),
      { signal: controller.signal },
    )
    controller.abort()
    await expect(starting).rejects.toMatchObject({ name: 'AbortError' })
    finish(worker) // too late: nobody is waiting for it
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('shuts down a worker that finishes after the timeout', async () => {
    const worker = fakeWorker()
    let finish: (w: typeof worker) => void = () => {}
    const starting = startGuarded(() => new Promise<typeof worker>((r) => (finish = r)), {
      timeoutMs: 1000,
    })
    const assertion = expect(starting).rejects.toThrow(/too long/)
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
    finish(worker)
    await vi.advanceTimersByTimeAsync(0)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('passes a rejection from the start itself through', async () => {
    await expect(
      startGuarded(async () => {
        throw new Error('core failed to load')
      }),
    ).rejects.toThrow('core failed to load')
  })

  it('passes on a start that throws at once, and leaves no timer or listener behind', async () => {
    const controller = new AbortController()
    const add = vi.spyOn(controller.signal, 'addEventListener')
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    await expect(
      startGuarded(
        () => {
          throw new Error('would not even begin')
        },
        { signal: controller.signal, timeoutMs: 5000 },
      ),
    ).rejects.toThrow('would not even begin')
    expect(remove).toHaveBeenCalledTimes(add.mock.calls.length) // every listener removed
    expect(vi.getTimerCount()).toBe(0)
  })
})
