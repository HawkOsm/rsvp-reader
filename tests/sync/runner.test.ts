import { describe, expect, it, vi } from 'vitest'
import { createSyncRunner, type Timers } from '@/sync/runner'

/** A task that waits until the test lets it finish. */
function gatedTask() {
  const runs: (() => void)[] = []
  const task = vi.fn(() => new Promise<void>((resolve) => runs.push(resolve)))
  const finish = async () => {
    runs.shift()?.()
    await new Promise((r) => setTimeout(r, 0))
  }
  return { task, finish }
}

function fakeTimers() {
  const pending = new Map<number, () => void>()
  let next = 1
  const timers: Timers = {
    setTimeout: (callback) => {
      pending.set(next, callback)
      return next++
    },
    clearTimeout: (handle) => void pending.delete(handle as number),
  }
  const fire = () => {
    const callbacks = [...pending.values()]
    pending.clear()
    callbacks.forEach((callback) => callback())
  }
  return { timers, fire, pending }
}

describe('the sync runner', () => {
  it('runs one at a time, with one more run for everything asked meanwhile', async () => {
    const { task, finish } = gatedTask()
    const runner = createSyncRunner(task)
    const first = runner.now()
    const second = runner.now()
    const third = runner.now()
    expect(task).toHaveBeenCalledTimes(1)
    expect(second).toBe(third)

    await finish()
    await first
    expect(task).toHaveBeenCalledTimes(2)
    await finish()
    await second
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('carries on after a run that failed', async () => {
    let calls = 0
    const runner = createSyncRunner(async () => {
      if (++calls === 1) throw new Error('boom')
    })
    const first = runner.now()
    const second = runner.now()
    await expect(first).rejects.toThrow('boom')
    await second
    expect(calls).toBe(2)
  })

  it('waits for quiet before a run asked for "soon"', async () => {
    const { timers, fire, pending } = fakeTimers()
    const task = vi.fn(async () => {})
    const runner = createSyncRunner(task, { timers })
    runner.soon()
    runner.soon()
    expect(pending.size).toBe(1)
    expect(task).not.toHaveBeenCalled()
    fire()
    expect(task).toHaveBeenCalledOnce()

    runner.soon()
    runner.stop()
    expect(pending.size).toBe(0)
    await runner.now()
    expect(task).toHaveBeenCalledOnce()
  })
})
