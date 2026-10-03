import { describe, expect, it, vi } from 'vitest'
import { DocumentSaveQueue } from './documentSaveQueue'

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe('document autosave ordering', () => {
  it('coalesces typing before a save', async () => {
    const write = vi.fn(async () => {})
    const queue = new DocumentSaveQueue(write)
    queue.change('A')
    queue.change('AB')
    queue.change('ABC')
    await queue.flush()
    expect(write.mock.calls).toEqual([['ABC']])
    expect(queue.dirty).toBe(false)
  })
  it('serializes newer edits behind the in-flight save; close waits for both', async () => {
    const first = deferred()
    const last = deferred()
    const write = vi
      .fn<(html: string) => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(last.promise)
    const queue = new DocumentSaveQueue(write)
    queue.change('old')
    const autosave = queue.flush()
    queue.change('latest')
    const close = queue.flush()
    const finished = vi.fn()
    void close.then(finished)
    expect(write).toHaveBeenCalledTimes(1)
    first.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(write.mock.calls).toEqual([['old'], ['latest']])
    expect(finished).not.toHaveBeenCalled()
    last.resolve()
    await autosave
    await close
    expect(queue.dirty).toBe(false)
    expect(finished).toHaveBeenCalledOnce()
  })
  it('retains failed edits and retries them', async () => {
    const write = vi
      .fn<(html: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValue(undefined)
    const queue = new DocumentSaveQueue(write)
    queue.change('Keep this')
    await expect(queue.flush()).rejects.toThrow('Offline')
    expect(queue.dirty).toBe(true)
    await queue.flush()
    expect(write.mock.calls).toEqual([['Keep this'], ['Keep this']])
    expect(queue.dirty).toBe(false)
  })
  it('keeps the newest pending edit when an older write fails', async () => {
    const first = deferred()
    const write = vi
      .fn<(html: string) => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined)
    const queue = new DocumentSaveQueue(write)
    queue.change('old')
    const pending = queue.flush()
    queue.change('latest')
    first.reject(new Error('Offline'))
    await expect(pending).rejects.toThrow('Offline')
    await queue.flush()
    expect(write.mock.calls).toEqual([['old'], ['latest']])
  })
})
