import { describe, expect, it, vi } from 'vitest'
import { ProjectStore, type ProjectStorageIo } from './projectStore'
import { createProject, emptyStore } from './projectModel'
import type { ProjectsStore } from '../types'

function fixture() {
  let disk = emptyStore()
  let revision = 0
  const io: ProjectStorageIo = {
    readJson: vi.fn(async () => ({
      value: structuredClone(disk),
      version: String(revision),
    })),
    writeJson: vi.fn(async (_, value, version) => {
      await Promise.resolve()
      if (version !== String(revision)) return { ok: false, conflict: true }
      disk = structuredClone(value) as ProjectsStore
      revision++
      return { ok: true }
    }),
  }
  return { io, storage: new ProjectStore(io), disk: () => disk }
}
const add =
  (name: string) =>
  (store: ProjectsStore): ProjectsStore => ({
    ...store,
    projects: [
      ...store.projects,
      createProject({ name }, '2026-10-03T00:00:00Z'),
    ],
  })

describe('project persistence', () => {
  it('persists a burst of eight independent edits without exhausting conflict retries', async () => {
    const { storage, disk, io } = fixture()
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => storage.update(add(String(i)))),
    )
    expect(disk().projects.map(project => project.name)).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ])
    expect(io.writeJson).toHaveBeenCalledTimes(8)
  })
  it('reads after pending writes instead of returning the old snapshot', async () => {
    const { storage } = fixture()
    const write = storage.update(add('New'))
    const read = storage.load()
    await write
    expect((await read).projects[0].name).toBe('New')
  })
  it('reapplies a conflicting edit to the other window’s fresh data', async () => {
    const { storage, io, disk } = fixture()
    const other = new ProjectStore(io)
    await Promise.all([
      storage.update(add('Here')),
      other.update(add('Elsewhere')),
    ])
    expect(disk().projects.map(project => project.name)).toEqual([
      'Here',
      'Elsewhere',
    ])
  })
  it('does not retry a refused write as if it were a conflict, and the next edit still works', async () => {
    const { storage, io, disk } = fixture()
    vi.mocked(io.writeJson).mockResolvedValueOnce({ ok: false })
    const change = vi.fn(add('Refused'))
    await expect(storage.update(change)).rejects.toThrow('could not be saved')
    expect(change).toHaveBeenCalledTimes(1)
    expect(io.writeJson).toHaveBeenCalledTimes(1)
    await storage.update(add('Saved'))
    expect(disk().projects.map(project => project.name)).toEqual(['Saved'])
  })
  it('rejects exhausted external conflicts without changing disk', async () => {
    const { storage, io, disk } = fixture()
    vi.mocked(io.writeJson).mockResolvedValue({ ok: false, conflict: true })
    await expect(storage.update(add('Unsaved'))).rejects.toThrow(
      'changed twice',
    )
    expect(disk().projects).toEqual([])
  })
})
