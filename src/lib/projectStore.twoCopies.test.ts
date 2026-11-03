import { describe, expect, it } from 'vitest'
import { addDeliverable, createProject, emptyStore } from './projectModel'
import { ProjectStore, type ProjectStorageIo } from './projectStore'
import type { ProjectsStore } from '../types'

/**
 * Two live copies of PureProjects (a tab and a copy held inside a page) over the one store. Each test runs two real
 * ProjectStores over one fake of the shell's JSON store, with `ifMatch` checked at the write. Every read and write takes a
 * turn of the event loop, as the shell's do, so two copies' saves really do interleave.
 */
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
function shared() {
  const disk = { value: emptyStore() as ProjectsStore, version: 1, writes: 0 }
  const io: ProjectStorageIo = {
    readJson: async () => { const value = structuredClone(disk.value), version = String(disk.version); await tick(); return { value, version } },
    writeJson: async (_file, value, ifMatch) => {
      await tick()
      if (ifMatch !== String(disk.version)) return { ok: false, conflict: true }
      disk.value = structuredClone(value) as ProjectsStore
      disk.version++
      disk.writes++
      return { ok: true, version: String(disk.version) }
    },
  }
  return { disk, a: new ProjectStore(io), b: new ProjectStore(io) }
}
const AT = '2026-10-03T00:00:00Z'
const addProject = (name: string) => (store: ProjectsStore): ProjectsStore => ({ ...store, projects: [...store.projects, { ...createProject({ name }, AT), id: name }] })
const addTo = (id: string, title: string) => (store: ProjectsStore): ProjectsStore => ({ ...store, projects: store.projects.map(p => (p.id === id ? addDeliverable(p, { title }, AT) : p)) })

describe('two copies of the store', () => {
  it('one after the other, neither having looked: both survive, as each change is made on what is on disk', async () => {
    const { disk, a, b } = shared()
    await a.update(addProject('from-a'))
    await b.update(addProject('from-b'))
    expect(disk.value.projects.map(p => p.id)).toEqual(['from-a', 'from-b'])
  })

  it('at the same moment: both survive', async () => {
    const { disk, a, b } = shared()
    await Promise.all([a.update(addProject('from-a')), b.update(addProject('from-b'))])
    expect(disk.value.projects.map(p => p.id).sort()).toEqual(['from-a', 'from-b'])
  })

  it('a run of changes from both, shuffled together: every one lands, and none is refused', async () => {
    const { disk, a, b } = shared()
    await a.update(addProject('p'))
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).update(addTo('p', `item ${i}`))))
    expect(results.filter(r => r.status === 'rejected')).toEqual([])
    expect(disk.value.projects[0]!.deliverables).toHaveLength(12)
  })

  it('a look that finds nothing new says so, so the list is not redrawn under the pointer', async () => {
    const { a, b } = shared()
    await a.update(addProject('p'))
    expect((await b.loadIfChanged())?.projects.map(p => p.id)).toEqual(['p'])
    expect(await b.loadIfChanged()).toBeNull()
    await a.update(addProject('q'))
    expect((await b.loadIfChanged())?.projects.map(p => p.id)).toEqual(['p', 'q'])
    await b.update(addProject('r'))
    expect(await b.loadIfChanged()).toBeNull()
  })
})
