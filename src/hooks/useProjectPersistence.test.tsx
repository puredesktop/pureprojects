// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useProjectPersistence } from './useProjectPersistence'
import { ProjectStore } from '../lib/projectStore'
import { createProject, emptyStore } from '../lib/projectModel'
import { createProjectHandler, updateProjectHandler } from '../agents/handlers'
import type { ProjectsAgentToolContext } from '../agents/catalog'
import type { ProjectsStore } from '../types'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const element = document.createElement('div')
const root = createRoot(element)
let state!: ReturnType<typeof useProjectPersistence>
function render(storage: ProjectStore, standalone = false) {
  function Harness() {
    state = useProjectPersistence(storage, standalone)
    return null
  }
  act(() => root.render(<Harness />))
}
afterEach(() => {
  act(() => root.render(null))
})
const add = (name: string) => (store: ProjectsStore) => ({
  ...store,
  projects: [
    ...store.projects,
    createProject({ name }, '2026-10-03T00:00:00Z'),
  ],
})

describe('project write acknowledgement', () => {
  it('leaves the last saved state intact and rejects a refused write', async () => {
    const storage = new ProjectStore({
      readJson: async () => ({ value: emptyStore(), version: null }),
      writeJson: async () => ({ ok: false }),
    })
    render(storage)
    await act(async () => {
      await expect(state.mutate(add('Unsaved'))).rejects.toThrow()
    })
    expect(state.store.projects).toEqual([])
    expect(state.writeError).toContain('not saved')
  })
  it('does not publish a save until the bridge acknowledges it', async () => {
    let confirm!: (value: { ok: boolean }) => void
    const storage = new ProjectStore({
      readJson: async () => ({ value: emptyStore(), version: null }),
      writeJson: () =>
        new Promise(resolve => {
          confirm = resolve
        }),
    })
    render(storage)
    let saving!: Promise<ProjectsStore>
    await act(async () => {
      saving = state.mutate(add('Pending'))
    })
    expect(state.store.projects).toHaveLength(0)
    await act(async () => {
      confirm({ ok: true })
      await saving
    })
    expect(state.store.projects[0].name).toBe('Pending')
  })
  it('rejects failed refreshes rather than giving agents a stale snapshot', async () => {
    render(
      new ProjectStore({
        readJson: async () => {
          throw new Error('Offline')
        },
        writeJson: vi.fn(),
      }),
    )
    await act(async () => {
      await expect(state.refresh()).rejects.toThrow('Offline')
    })
    expect(state.writeError).toContain('could not be refreshed')
  })
  it('supports immediate consecutive standalone edits without calling the host', async () => {
    const io = { readJson: vi.fn(), writeJson: vi.fn() }
    render(new ProjectStore(io), true)
    await act(async () => {
      await Promise.all([state.mutate(add('One')), state.mutate(add('Two'))])
    })
    expect(state.store.projects.map(project => project.name)).toEqual([
      'One',
      'Two',
    ])
    expect(io.readJson).not.toHaveBeenCalled()
    expect(io.writeJson).not.toHaveBeenCalled()
  })
  it('does not give an assistant a successful create receipt or focus an unsaved project', async () => {
    const storage = new ProjectStore({
      readJson: async () => ({ value: emptyStore(), version: null }),
      writeJson: async () => ({ ok: false }),
    })
    render(storage)
    const focusProject = vi.fn()
    const context = {
      ...state,
      now: () => new Date('2026-10-03'),
      focusProject,
    } as unknown as ProjectsAgentToolContext
    await act(async () => {
      await expect(
        createProjectHandler(context, { name: 'Unsaved' }),
      ).rejects.toThrow()
    })
    expect(focusProject).not.toHaveBeenCalled()
    expect(state.store.projects).toHaveLength(0)
  })
})

it('does not report a project edit after another window deleted the project between refresh and write', async () => {
  const existing = createProject(
    { name: 'Old project' },
    '2026-10-03T00:00:00Z',
  )
  const storage = new ProjectStore({
    readJson: vi
      .fn()
      .mockResolvedValueOnce({
        value: { storeVersion: 1, projects: [existing] },
        version: '1',
      })
      .mockResolvedValue({ value: emptyStore(), version: '2' }),
    writeJson: vi.fn(async () => ({ ok: true })),
  })
  render(storage)
  const context = {
    ...state,
    now: () => new Date('2026-10-03'),
    focusProject: vi.fn(),
  } as unknown as ProjectsAgentToolContext
  await act(async () => {
    await expect(
      updateProjectHandler(context, {
        projectId: existing.id,
        name: 'New name',
      }),
    ).rejects.toThrow('no longer exists')
  })
  expect(context.focusProject).not.toHaveBeenCalled()
})

it('keeps block reads and edits working with the lazily loaded document schema', async () => {
  const { buildExtensions } = await import('@purescience/platform-editor')
  const { readDocumentHandler, replaceDocumentBlockHandler } = await import(
    '../agents/handlers'
  )
  const path = '/fixture/Notes.document'
  const project = createProject({ name: 'Workshop' }, '2026-10-03T00:00:00Z')
  project.links = [{ id: 'doc', path, label: 'Notes', kind: 'document' }]
  const snapshot = { storeVersion: 1, projects: [project] }
  let html = '<p>Original notes</p>'
  const context = {
    refresh: async () => snapshot,
    readDocument: async () => html,
    writeDocument: async (_: string, content: string) => {
      html = content
    },
    documentExtensions: async () => buildExtensions(),
  } as unknown as ProjectsAgentToolContext
  expect((await readDocumentHandler(context, { path })).content).toContain(
    'Original notes',
  )
  const result = await replaceDocumentBlockHandler(context, {
    path,
    index: 0,
    html: '<p>Updated notes</p>',
  })
  expect(result.content).toContain('Updated notes')
  expect(html).toContain('Updated notes')
})
