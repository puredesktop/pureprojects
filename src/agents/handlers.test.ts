import { describe, expect, it, vi } from 'vitest'
import { createProject } from '../lib/projectModel'
import type { ProjectsStore } from '../types'
import type { ProjectsAgentToolContext } from './catalog'
import { addDeliverableHandler } from './handlers'

const NOW = '2026-10-07T12:00:00.000Z'

function setup(openProjectId: string | null = 'open') {
  let store: ProjectsStore = {
    storeVersion: 1,
    projects: ['other', 'open'].map(id => ({ ...createProject({ name: id }, NOW), id })),
  }
  const focusProject = vi.fn()
  const context: ProjectsAgentToolContext = {
    store,
    now: () => new Date(NOW),
    refresh: async () => store,
    mutate: async fn => { store = fn(store); return store },
    openProjectId: () => openProjectId,
    focusProject,
    createDocument: vi.fn(),
    readDocument: vi.fn(),
    writeDocument: vi.fn(),
    documentExtensions: () => [],
    exportDocumentsPdf: vi.fn(),
    exportProjectZip: vi.fn(),
  }
  return { context, focusProject, store: () => store }
}

describe('adding todos to the current project', () => {
  it('uses the open project and leaves unspecified owner and deadline unset', async () => {
    const app = setup()
    const result = await addDeliverableHandler(app.context, { title: 'Send the agenda' })
    expect(app.store().projects[0]!.deliverables).toEqual([])
    expect(app.store().projects[1]!.deliverables).toEqual([
      expect.objectContaining({ title: 'Send the agenda', owner: '', dueAt: '', doneAt: null }),
    ])
    expect(JSON.parse(result.content as string)).toMatchObject({ added: true, projectId: 'open', projectName: 'open' })
    expect(app.focusProject).toHaveBeenCalledWith('open')
  })

  it('honours an explicit target instead of the open project', async () => {
    const app = setup()
    await addDeliverableHandler(app.context, { projectId: 'other', title: 'Review', owner: 'Ana', dueAt: '2026-10-14' })
    expect(app.store().projects[0]!.deliverables[0]).toMatchObject({ title: 'Review', owner: 'Ana', dueAt: '2026-10-14' })
    expect(app.store().projects[1]!.deliverables).toEqual([])
  })

  it('does not guess a target when no project is open', async () => {
    const app = setup(null)
    const result = await addDeliverableHandler(app.context, { title: 'Review' })
    expect(result.isError).toBe(true)
    expect(app.store().projects.every(project => project.deliverables.length === 0)).toBe(true)
    expect(app.focusProject).not.toHaveBeenCalled()
  })

  it('does not redirect an invalid explicit target to the open project', async () => {
    const app = setup()
    const result = await addDeliverableHandler(app.context, { projectId: 'missing', title: 'Review' })
    expect(result.isError).toBe(true)
    expect(app.store().projects.every(project => project.deliverables.length === 0)).toBe(true)
  })

  it('refuses a stale open project instead of adding to another one', async () => {
    const app = setup('removed')
    const result = await addDeliverableHandler(app.context, { title: 'Review' })
    expect(result.isError).toBe(true)
    expect(app.store().projects.every(project => project.deliverables.length === 0)).toBe(true)
  })
})
