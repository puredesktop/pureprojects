// @vitest-environment happy-dom
import { buildExtensions } from '@purescience/platform-editor'
import { describe, expect, it, vi } from 'vitest'
import { createProject } from '../lib/projectModel'
import type { ProjectsStore } from '../types'
import type { ProjectsAgentToolContext } from './catalog'
import {
  addDeliverableHandler,
  deleteDocumentBlockHandler,
  insertDocumentBlockHandler,
  readDocumentHandler,
  replaceDocumentBlockHandler,
} from './handlers'

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

describe('document edits reply with what changed, not the whole document', () => {
  const PATH = '/docs/Plan.document'
  const extensions = buildExtensions()
  const longDoc =
    '<h1>Plan</h1>' +
    Array.from({ length: 200 }, (_, index) => `<p>Paragraph ${index}: ${'a sentence of real prose. '.repeat(6)}</p>`).join('')

  function docSetup() {
    let html = longDoc
    const app = setup()
    const store = app.store()
    store.projects[1]!.links = [{ id: 'link-1', label: 'Plan', path: PATH, kind: 'document' }]
    const context: ProjectsAgentToolContext = {
      ...app.context,
      refresh: async () => store,
      readDocument: async () => html,
      writeDocument: async (_path: string, next: string) => { html = next },
      documentExtensions: () => extensions,
    }
    return { context, html: () => html }
  }

  it('insert reports the new block, the count and the shift', async () => {
    const doc = docSetup()
    const result = await insertDocumentBlockHandler(doc.context, {
      path: PATH, at: 'after', index: 0, html: '<h2>Summary</h2>',
    })
    const reply = JSON.parse(result.content as string)
    expect(reply).toMatchObject({ path: PATH, inserted: true, index: 1, blockCount: 202 })
    expect(reply.changedBlocks).toEqual([expect.objectContaining({ index: 1, type: 'heading', preview: 'Summary' })])
    expect(reply.shifted).toBe('blocks from index 2 on moved by +1')
    expect(reply.blocks).toBeUndefined()
    expect(doc.html()).toContain('<h2>Summary</h2>')
    const fullRead = (await readDocumentHandler(doc.context, { path: PATH })).content as string
    if (process.env.MEASURE) console.log(`insertDocumentBlock reply: ${fullRead.length} (old: whole block list) -> ${(result.content as string).length} chars`)
    expect((result.content as string).length).toBeLessThan(1_000)
  })

  it('insert at the end and replace name the block they wrote', async () => {
    const doc = docSetup()
    const end = JSON.parse((await insertDocumentBlockHandler(doc.context, { path: PATH, html: '<p>Closing.</p>' })).content as string)
    expect(end).toMatchObject({ inserted: true, index: 201, blockCount: 202 })
    expect(end.changedBlocks[0]).toMatchObject({ index: 201, preview: 'Closing.' })
    expect(end.shifted).toBeUndefined()
    const replaced = JSON.parse((await replaceDocumentBlockHandler(doc.context, { path: PATH, index: 3, html: '<p>Reworded.</p>' })).content as string)
    expect(replaced).toMatchObject({ replaced: true, index: 3, blockCount: 202 })
    expect(replaced.changedBlocks).toEqual([expect.objectContaining({ index: 3, preview: 'Reworded.' })])
    expect(replaced.shifted).toBeUndefined()
  })

  it('delete reports the count and the shift only', async () => {
    const doc = docSetup()
    const reply = JSON.parse((await deleteDocumentBlockHandler(doc.context, { path: PATH, index: 5 })).content as string)
    expect(reply).toMatchObject({ deleted: true, index: 5, blockCount: 200, shifted: 'blocks from index 5 on moved by -1' })
    expect(reply.changedBlocks).toBeUndefined()
  })

  it('readDocument still returns every block by default, and a stretch when asked', async () => {
    const doc = docSetup()
    const all = JSON.parse((await readDocumentHandler(doc.context, { path: PATH })).content as string)
    expect(all.blockCount).toBe(201)
    expect(all.blocks).toHaveLength(201)
    expect(all.fromIndex).toBeUndefined()
    const stretch = JSON.parse((await readDocumentHandler(doc.context, { path: PATH, fromIndex: 10, limit: 5 })).content as string)
    expect(stretch).toMatchObject({ blockCount: 201, fromIndex: 10, returned: 5 })
    expect(stretch.blocks.map((block: { index: number }) => block.index)).toEqual([10, 11, 12, 13, 14])
  })
})
