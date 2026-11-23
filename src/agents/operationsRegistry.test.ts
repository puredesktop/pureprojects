// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { buildExtensions } from '@purescience/platform-editor'
import { describe, expect, it, vi } from 'vitest'
import {
  addDeliverable,
  addWaitingOn,
  archiveProject,
  createProject,
  linkDocument,
  logJournalEntry,
  updateDeliverable,
} from '../lib/projectModel'
import type { ProjectsStore } from '../types'
import { PUREPROJECTS_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import {
  AgentProjectsToolError,
  EXPOSED_TOOL_NAMES,
  PUREPROJECTS_AGENT_TOOL_NAMES,
  PUREPROJECTS_ALL_ATOMIC_TOOL_NAMES,
  PUREPROJECTS_CORE_TOOL_NAMES,
  PUREPROJECTS_EXTENDED_TOOL_NAMES,
  PUREPROJECTS_FUNCTION_NAMES,
  PUREPROJECTS_META_TOOL_NAMES,
  type ProjectsAgentToolContext,
} from './catalog'
import {
  PUREPROJECTS_OPERATIONS_REGISTRY,
  buildPureProjectsHandlers,
} from './operationsRegistry'

const NOW = '2026-11-23T12:00:00.000Z'

const invoke = (shortName: string, args: Record<string, unknown> = {}) => ({
  toolCallId: `tc_${shortName}`,
  shortName,
  arguments: args,
})

const RELEASE_VERBS = new Set([
  'send',
  'sends',
  'sending',
  'merge',
  'merges',
  'merging',
  'publish',
  'publishes',
  'publishing',
  'deposit',
  'deposits',
  'depositing',
  'deploy',
  'deploys',
  'deploying',
  'post',
  'posts',
  'posting',
])

function makeRichFixture() {
  const docPath = '/docs/Grant-Proposal.document'
  const pdfAttachment = '/docs/Budget-2026.pdf'

  let grant = createProject(
    {
      name: 'Autumn Grant Application',
      summary: 'Coordinate full grant submission with external partners.',
      area: 'Funding',
      status: 'active',
      nextAction: 'Review budget narrative',
      dueAt: '2026-11-20', // overdue by 3 days relative to 2026-11-23
      people: ['Ada', 'Vincent'],
    },
    '2026-11-01T09:00:00.000Z',
  )
  grant = addDeliverable(
    grant,
    { title: 'Review budget narrative', owner: 'Ada', dueAt: '2026-11-19' }, // overdue open
    '2026-11-02T09:00:00.000Z',
  )
  grant = addDeliverable(
    grant,
    { title: 'Finalize letters of support', owner: 'Vincent', dueAt: '2026-11-26' }, // due soon open
    '2026-11-02T09:00:00.000Z',
  )
  grant = addDeliverable(
    grant,
    { title: 'Draft executive summary', owner: '', dueAt: '2026-11-10' }, // completed
    '2026-11-02T09:00:00.000Z',
  )
  const completedDelId = grant.deliverables[2]!.id
  grant = updateDeliverable(grant, completedDelId, { done: true }, '2026-11-11T09:00:00.000Z')
  grant = addWaitingOn(
    grant,
    { person: 'Vincent', what: 'Signed funder list', askedAt: '2026-11-10' }, // 13 days stale
    '2026-11-10T09:00:00.000Z',
  )
  grant = addWaitingOn(
    grant,
    { person: 'Maya', what: 'Legal sign-off', askedAt: '2026-11-20' }, // 3 days fresh
    '2026-11-20T09:00:00.000Z',
  )
  grant = logJournalEntry(
    grant,
    { title: 'Expanded scope to 24 months', body: 'Program officer confirmed two-year grants are eligible.' },
    '2026-11-15T09:00:00.000Z',
  )
  grant = linkDocument(
    grant,
    { label: 'Grant Proposal', path: docPath, kind: 'document' },
    '2026-11-12T09:00:00.000Z',
  )
  grant = linkDocument(
    grant,
    { label: 'Budget Sheet', path: pdfAttachment, kind: 'document' },
    '2026-11-12T09:00:00.000Z',
  )
  grant = linkDocument(
    grant,
    { label: 'Funder Portal', path: 'https://funder.example.org/portal', kind: 'web' },
    '2026-11-12T09:00:00.000Z',
  )

  // Project with no next action, stale updatedAt, due soon
  let website = createProject(
    {
      name: 'Website Refresh',
      summary: 'Update public documentation site.',
      area: 'Comms',
      status: 'active',
      nextAction: '',
      dueAt: '2026-11-27',
      people: ['Grace'],
    },
    '2026-11-01T09:00:00.000Z',
  )
  website = addDeliverable(
    website,
    { title: 'Audit landing copy', owner: 'Grace', dueAt: '2026-11-25' },
    '2026-11-01T09:00:00.000Z',
  )

  // Project whose deliverables are all done but status is still active (ready-to-close)
  let workshop = createProject(
    {
      name: 'November Workshop',
      area: 'Comms',
      status: 'active',
      nextAction: 'Wrap up notes',
      people: ['Ada'],
    },
    '2026-11-18T09:00:00.000Z',
  )
  workshop = addDeliverable(
    workshop,
    { title: 'Publish slides', owner: 'Ada', dueAt: '2026-11-18' },
    '2026-11-18T09:00:00.000Z',
  )
  workshop = updateDeliverable(
    workshop,
    workshop.deliverables[0]!.id,
    { done: true },
    '2026-11-19T09:00:00.000Z',
  )

  // Archived project (excluded by default)
  let filed = createProject(
    {
      name: '2025 Annual Report',
      area: 'Funding',
      status: 'done',
      people: ['Ada'],
    },
    '2026-01-10T09:00:00.000Z',
  )
  filed = archiveProject(filed, '2026-02-01T09:00:00.000Z')

  let store: ProjectsStore = {
    storeVersion: 1,
    projects: [grant, website, workshop, filed],
  }

  let openId: string | null = grant.id
  const documents = new Map<string, string>([
    [
      docPath,
      '<h1>Grant Proposal</h1><p>Executive summary paragraph.</p><h2>Timeline</h2><p>Milestones for 2027.</p>',
    ],
  ])
  const extensions = buildExtensions()

  const focusProject = vi.fn((id: string) => {
    openId = id
  })
  const createDocumentMock = vi.fn(
    async (input: { projectId: string; title: string; html?: string }) => {
      const slug = input.title.replace(/\s+/g, '-')
      const path = `/docs/${slug}.document`
      documents.set(path, input.html ?? `<h1>${input.title}</h1>`)
      store = {
        ...store,
        projects: store.projects.map(p =>
          p.id === input.projectId
            ? linkDocument(p, { label: input.title, path, kind: 'document' }, NOW)
            : p,
        ),
      }
      return { path, name: input.title }
    },
  )
  const readDocumentMock = vi.fn(async (path: string) => {
    const html = documents.get(path)
    if (html === undefined) throw new Error(`Missing document ${path}`)
    return html
  })
  const writeDocumentMock = vi.fn(async (path: string, html: string) => {
    documents.set(path, html)
  })
  const exportDocumentsPdfMock = vi.fn(async (_projectId: string, paths: string[]) => {
    const pkgPaths = paths.filter(p => p.endsWith('.document'))
    return {
      written: pkgPaths.map(p => p.replace(/\.document$/, '.pdf')),
      skipped: paths.length - pkgPaths.length,
    }
  })
  const exportProjectZipMock = vi.fn(async (projectId: string, paths: string[]) => {
    return `/Documents/export-${projectId}-${paths.length}.zip`
  })

  const ctx: ProjectsAgentToolContext = {
    get store() {
      return store
    },
    refresh: async () => store,
    now: () => new Date(NOW),
    mutate: async fn => {
      store = fn(store)
      return store
    },
    focusProject,
    openProjectId: () => openId,
    createDocument: createDocumentMock,
    readDocument: readDocumentMock,
    writeDocument: writeDocumentMock,
    documentExtensions: () => extensions,
    exportDocumentsPdf: exportDocumentsPdfMock,
    exportProjectZip: exportProjectZipMock,
  }

  const handlers = buildPureProjectsHandlers(() => ctx)

  return {
    ctx,
    handlers,
    getStore: () => store,
    setOpenId: (id: string | null) => {
      openId = id
    },
    ids: {
      grantId: grant.id,
      websiteId: website.id,
      workshopId: workshop.id,
      filedId: filed.id,
      grantOpenDel1: grant.deliverables[0]!.id,
      grantOpenDel2: grant.deliverables[1]!.id,
      grantDoneDel: completedDelId,
      grantWaitVincent: grant.waitingOn[0]!.id,
      grantWaitMaya: grant.waitingOn[1]!.id,
      grantLinkWeb: grant.links[2]!.id,
      docPath,
      pdfAttachment,
    },
    mocks: {
      focusProject,
      createDocumentMock,
      readDocumentMock,
      writeDocumentMock,
      exportDocumentsPdfMock,
      exportProjectZipMock,
    },
  }
}

describe('PureProjects Operations Registry & Manifest Sync', () => {
  it('enforces 3-tier exposure invariants and audit summary', () => {
    const summary = PUREPROJECTS_OPERATIONS_REGISTRY.auditSummary()
    expect(summary).toEqual({
      appSlug: 'projects',
      functions: 6,
      coreTools: 6,
      extendedTools: 17,
      metaTools: 3,
      totalExposed: 15,
      totalAtomicTools: 23,
      totalRegistered: 29,
      schemaReductionPercent: 35,
    })

    expect(PUREPROJECTS_OPERATIONS_REGISTRY.exposedToolNames).toEqual([
      ...EXPOSED_TOOL_NAMES,
    ])
    expect(PUREPROJECTS_OPERATIONS_REGISTRY.exposedToolNames).toEqual([
      ...PUREPROJECTS_AGENT_TOOL_NAMES,
    ])
    expect(PUREPROJECTS_OPERATIONS_REGISTRY.extendedToolNames).toEqual([
      ...PUREPROJECTS_EXTENDED_TOOL_NAMES,
    ])
    expect(PUREPROJECTS_OPERATIONS_REGISTRY.allAtomicToolNames).toEqual([
      ...PUREPROJECTS_ALL_ATOMIC_TOOL_NAMES,
    ])
    expect(PUREPROJECTS_FUNCTION_NAMES).toHaveLength(6)
    expect(PUREPROJECTS_CORE_TOOL_NAMES).toHaveLength(6)
    expect(PUREPROJECTS_META_TOOL_NAMES).toHaveLength(3)
    expect(PUREPROJECTS_ATOMIC_TOOL_SCHEMAS).toHaveLength(23)
  })

  it('matches plugin.json app.agents.tools 1:1', () => {
    const manifest = JSON.parse(readFileSync('plugin.json', 'utf8')) as {
      app: { agents: { tools: unknown[] } }
    }
    expect(manifest.app.agents.tools).toEqual([
      ...PUREPROJECTS_OPERATIONS_REGISTRY.manifestTools,
    ])
  })

  it('satisfies manifest quality and safety rules on every exposed entry and atomic schema', () => {
    for (const entry of PUREPROJECTS_OPERATIONS_REGISTRY.manifestTools) {
      expect(entry.description.trim().length).toBeGreaterThanOrEqual(80)
      expect(typeof entry.requiresApproval).toBe('boolean')
      expect(['read', 'write', 'destructive', 'external', 'release']).toContain(
        entry.risk,
      )
      const firstDescWord =
        entry.description
          .trim()
          .split(/[^A-Za-z]+/)
          .find(Boolean)
          ?.toLowerCase() ?? ''
      const firstNameWord =
        entry.name
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
          .split(/[^A-Za-z]+/)
          .find(Boolean)
          ?.toLowerCase() ?? ''
      if (entry.risk !== 'release') {
        expect(RELEASE_VERBS.has(firstDescWord)).toBe(false)
        expect(RELEASE_VERBS.has(firstNameWord)).toBe(false)
      }
    }

    for (const schema of PUREPROJECTS_ATOMIC_TOOL_SCHEMAS) {
      expect(schema.description.trim().length).toBeGreaterThanOrEqual(80)
      expect(typeof schema.requiresApproval).toBe('boolean')
    }

    const deleteProj = PUREPROJECTS_OPERATIONS_REGISTRY.coreTools.find(
      t => t.name === 'deleteProject',
    )
    expect(deleteProj?.deletesPermanently).toBe(true)
    expect(deleteProj?.exposure).toBe('always')

    // Functions with path arguments must instruct calling getProjectsContext first.
    const kickoff = PUREPROJECTS_OPERATIONS_REGISTRY.manifestTools.find(
      t => t.name === 'fn_kickoffProject',
    )
    const handover = PUREPROJECTS_OPERATIONS_REGISTRY.manifestTools.find(
      t => t.name === 'fn_prepareHandoverPackage',
    )
    expect(kickoff?.description).toMatch(/call getProjectsContext first/i)
    expect(handover?.description).toMatch(/call getProjectsContext first/i)
  })
})

describe('PureProjects Composite App Functions (fn_*)', () => {
  it('fn_portfolioBriefing computes radar, waits oldest-first, hygiene findings, workload, and filters', async () => {
    const fx = makeRichFixture()
    const raw = await fx.handlers.fn_portfolioBriefing(
      invoke('fn_portfolioBriefing', {
        asOfDate: '2026-11-23',
        horizonDays: 7,
        staleWaitDays: 7,
        staleProjectDays: 14,
      }),
    )
    const parsed = JSON.parse(raw.content as string)
    expect(parsed.ok).toBe(true)
    expect(parsed.opClass).toBe('function')
    expect(parsed.function).toBe('fn_portfolioBriefing')

    const { data } = parsed
    expect(data.openProject.id).toBe(fx.ids.grantId)
    expect(data.totals.total).toBe(3) // excludes archived
    expect(data.totals.archivedTotal).toBe(1)
    expect(data.totals.overdue).toBe(1)
    expect(data.totals.activeWaits).toBe(2)
    expect(data.totals.staleWaits).toBe(1)

    expect(data.radar.overdueProjects[0].id).toBe(fx.ids.grantId)
    expect(data.radar.dueSoonProjects[0].id).toBe(fx.ids.websiteId)
    expect(data.radar.overdueDeliverables).toHaveLength(1)
    expect(data.radar.overdueDeliverables[0].title).toBe('Review budget narrative')
    expect(data.radar.upcomingDeliverables).toHaveLength(2)

    // Waits sorted oldest-first
    expect(data.waits.oldestFirst[0].person).toBe('Vincent')
    expect(data.waits.oldestFirst[0].daysWaiting).toBe(13)
    expect(data.waits.oldestFirst[0].stale).toBe(true)
    expect(data.waits.oldestFirst[1].person).toBe('Maya')
    expect(data.waits.oldestFirst[1].stale).toBe(false)
    expect(data.waits.byPerson[0].person).toBe('Vincent')

    // Hygiene findings
    const codes = data.findings.map((f: { code: string }) => f.code)
    expect(codes).toEqual(
      expect.arrayContaining([
        'overdue-projects',
        'overdue-deliverables',
        'missing-next-action',
        'stale-waits',
        'ready-to-close',
        'stale-projects',
      ]),
    )
    expect(data.healthScore).toBeLessThan(100)

    // Filters: area + includeArchived
    const fundingAll = JSON.parse(
      (
        await fx.handlers.fn_portfolioBriefing(
          invoke('fn_portfolioBriefing', { area: 'funding', includeArchived: true }),
        )
      ).content as string,
    )
    expect(fundingAll.data.totals.total).toBe(2)

    const graceOnly = JSON.parse(
      (
        await fx.handlers.fn_portfolioBriefing(
          invoke('fn_portfolioBriefing', { person: 'grace' }),
        )
      ).content as string,
    )
    expect(graceOnly.data.projects).toHaveLength(1)
    expect(graceOnly.data.projects[0].id).toBe(fx.ids.websiteId)

    // Invalid inputs throw AgentProjectsToolError
    await expect(
      fx.handlers.fn_portfolioBriefing(
        invoke('fn_portfolioBriefing', { status: 'invalid' }),
      ),
    ).rejects.toThrow(AgentProjectsToolError)
    await expect(
      fx.handlers.fn_portfolioBriefing(
        invoke('fn_portfolioBriefing', { asOfDate: 'not-a-date' }),
      ),
    ).rejects.toThrow(AgentProjectsToolError)
  })

  it('fn_getProjectDossier returns full dossier defaulting to openProject with optional document previews', async () => {
    const fx = makeRichFixture()

    const parsed = JSON.parse(
      (
        await fx.handlers.fn_getProjectDossier(
          invoke('fn_getProjectDossier', {
            includeDocumentPreviews: true,
            previewBlockLimit: 2,
            asOfDate: '2026-11-23',
          }),
        )
      ).content as string,
    )
    expect(parsed.ok).toBe(true)
    const { data } = parsed
    expect(data.project.id).toBe(fx.ids.grantId)
    expect(data.nextActionDeliverable.id).toBe(fx.ids.grantOpenDel1)
    expect(data.deliverables.open).toHaveLength(2)
    expect(data.deliverables.overdue).toHaveLength(1)
    expect(data.deliverables.completed).toHaveLength(1)
    expect(data.waitingOn).toHaveLength(2)
    expect(data.waitingOn[0].daysWaiting).toBe(13)
    expect(data.journal.total).toBe(1)
    expect(data.links.byKind).toMatchObject({ document: 2, web: 1 })
    expect(data.documentPreviews).toHaveLength(1)
    expect(data.documentPreviews[0]).toMatchObject({
      path: fx.ids.docPath,
      blockCount: 4,
    })
    expect(data.documentPreviews[0].previewBlocks).toHaveLength(2)

    // Refuses when nothing is open and projectId omitted
    fx.setOpenId(null)
    await expect(
      fx.handlers.fn_getProjectDossier(invoke('fn_getProjectDossier', {})),
    ).rejects.toThrow(AgentProjectsToolError)
  })

  it('fn_kickoffProject scaffolds project, deliverables, waits, links, journal, and document atomically', async () => {
    const fx = makeRichFixture()
    const beforeCount = fx.getStore().projects.length

    const parsed = JSON.parse(
      (
        await fx.handlers.fn_kickoffProject(
          invoke('fn_kickoffProject', {
            name: 'Q1 Research Sprint',
            summary: 'Run usability interviews and synthesize findings.',
            area: 'Research',
            dueAt: '2027-01-31',
            people: ['Ada', 'Linus'],
            deliverables: [
              { title: 'Recruit 8 participants', owner: 'Ada', dueAt: '2026-12-05' },
              { title: 'Run synthesis workshop', owner: 'Linus', dueAt: '2027-01-15' },
            ],
            waitingOn: [{ person: 'Ethics Board', what: 'Protocol approval' }],
            links: [
              { label: 'Interview Guide', path: 'https://docs.example.org/guide' },
            ],
            journalEntry: {
              title: 'Sprint kicked off',
              body: 'Approved 8-participant sample size.',
            },
            initialDocument: {
              title: 'Research Plan',
              html: '<h1>Research Plan</h1><p>Initial outline.</p>',
            },
          }),
        )
      ).content as string,
    )

    expect(parsed.ok).toBe(true)
    expect(fx.getStore().projects).toHaveLength(beforeCount + 1)
    const created = fx.getStore().projects.find(p => p.id === parsed.data.project.id)!
    expect(created.status).toBe('waiting') // waitingOn auto-sets waiting
    expect(created.nextAction).toBe('Recruit 8 participants') // auto-promoted
    expect(created.deliverables).toHaveLength(2)
    expect(created.waitingOn).toHaveLength(1)
    expect(created.links).toHaveLength(2) // web link + created document link
    expect(created.links[0]!.kind).toBe('web')
    expect(created.journal).toHaveLength(1)
    expect(parsed.data.createdDocument.name).toBe('Research Plan')
    expect(fx.mocks.focusProject).toHaveBeenCalledWith(created.id)

    // Validation failure leaves store untouched
    const countAfterGood = fx.getStore().projects.length
    await expect(
      fx.handlers.fn_kickoffProject(
        invoke('fn_kickoffProject', {
          name: 'Broken Project',
          links: [{ label: 'Missing path' }],
        }),
      ),
    ).rejects.toThrow(AgentProjectsToolError)
    expect(fx.getStore().projects).toHaveLength(countAfterGood)
  })

  it('fn_updateProjectProgress supports dryRun preview and atomic multi-part check-in', async () => {
    const fx = makeRichFixture()

    // 1. Dry run previews without mutating
    const dry = JSON.parse(
      (
        await fx.handlers.fn_updateProjectProgress(
          invoke('fn_updateProjectProgress', {
            dryRun: true,
            updateDeliverables: [{ deliverableId: fx.ids.grantOpenDel1, done: true }],
            promoteDeliverableId: fx.ids.grantOpenDel2,
            resolveWaitingIds: [fx.ids.grantWaitVincent],
            journalEntry: { title: 'Funder list arrived', body: 'Vincent delivered signed list.' },
          }),
        )
      ).content as string,
    )
    expect(dry.ok).toBe(true)
    expect(dry.data.dryRun).toBe(true)
    expect(dry.data.project.nextAction).toBe('Finalize letters of support')
    // Store untouched after dryRun
    const grantBefore = fx.getStore().projects.find(p => p.id === fx.ids.grantId)!
    expect(grantBefore.waitingOn).toHaveLength(2)
    expect(grantBefore.journal).toHaveLength(1)

    // 2. Real persisted check-in
    const applied = JSON.parse(
      (
        await fx.handlers.fn_updateProjectProgress(
          invoke('fn_updateProjectProgress', {
            addDeliverables: [{ title: 'Upload final packet', owner: 'Ada', dueAt: '2026-11-28' }],
            updateDeliverables: [{ deliverableId: fx.ids.grantOpenDel1, done: true }],
            promoteDeliverableId: fx.ids.grantOpenDel2,
            clearAllWaits: true,
            journalEntry: { title: 'All blockers cleared', body: 'Ready for final assembly.' },
          }),
        )
      ).content as string,
    )
    expect(applied.ok).toBe(true)
    expect(applied.data.dryRun).toBe(false)
    expect(applied.data.deliverablesAdded).toBe(1)
    expect(applied.data.waitsResolved).toBe(2)

    const grantAfter = fx.getStore().projects.find(p => p.id === fx.ids.grantId)!
    expect(grantAfter.status).toBe('active') // returned to active after clearing all waits
    expect(grantAfter.nextAction).toBe('Finalize letters of support')
    expect(grantAfter.deliverables).toHaveLength(4)
    expect(grantAfter.journal).toHaveLength(2)

    // Refuses promoting a completed deliverable or setting waiting status directly
    await expect(
      fx.handlers.fn_updateProjectProgress(
        invoke('fn_updateProjectProgress', {
          promoteDeliverableId: fx.ids.grantDoneDel,
        }),
      ),
    ).rejects.toThrow(AgentProjectsToolError)
    await expect(
      fx.handlers.fn_updateProjectProgress(
        invoke('fn_updateProjectProgress', { status: 'waiting' }),
      ),
    ).rejects.toThrow(AgentProjectsToolError)
  })

  it('fn_batchRebalanceProjects supports dryRun, multi-project updates, archiving, and deliverable moves', async () => {
    const fx = makeRichFixture()

    // Dry run
    const dry = JSON.parse(
      (
        await fx.handlers.fn_batchRebalanceProjects(
          invoke('fn_batchRebalanceProjects', {
            dryRun: true,
            projectUpdates: [
              {
                projectId: fx.ids.workshopId,
                status: 'done',
                archive: true,
                journalEntry: { title: 'Closed workshop', body: 'All slides published.' },
              },
            ],
            deliverableMoves: [
              {
                fromProjectId: fx.ids.grantId,
                deliverableId: fx.ids.grantOpenDel2,
                toProjectId: fx.ids.websiteId,
              },
            ],
          }),
        )
      ).content as string,
    )
    expect(dry.ok).toBe(true)
    expect(dry.data.dryRun).toBe(true)
    // Verify store untouched
    expect(
      fx.getStore().projects.find(p => p.id === fx.ids.workshopId)!.archivedAt,
    ).toBeNull()

    // Real persisted batch
    const applied = JSON.parse(
      (
        await fx.handlers.fn_batchRebalanceProjects(
          invoke('fn_batchRebalanceProjects', {
            projectUpdates: [
              {
                projectId: fx.ids.websiteId,
                nextAction: 'Audit landing copy',
                addPeople: ['Ada', 'grace'], // grace already exists -> deduplicated
              },
              {
                projectId: fx.ids.workshopId,
                status: 'done',
                archive: true,
              },
            ],
            deliverableMoves: [
              {
                fromProjectId: fx.ids.grantId,
                deliverableId: fx.ids.grantOpenDel2,
                toProjectId: fx.ids.websiteId,
              },
            ],
          }),
        )
      ).content as string,
    )
    expect(applied.ok).toBe(true)
    expect(applied.data.projectUpdatesApplied).toBe(2)
    expect(applied.data.deliverableMovesApplied).toBe(1)

    const website = fx.getStore().projects.find(p => p.id === fx.ids.websiteId)!
    const grant = fx.getStore().projects.find(p => p.id === fx.ids.grantId)!
    const workshop = fx.getStore().projects.find(p => p.id === fx.ids.workshopId)!
    expect(website.people).toEqual(['Grace', 'Ada'])
    expect(website.deliverables.some(d => d.id === fx.ids.grantOpenDel2)).toBe(true)
    expect(grant.deliverables.some(d => d.id === fx.ids.grantOpenDel2)).toBe(false)
    expect(workshop.status).toBe('done')
    expect(workshop.archivedAt).not.toBeNull()

    // All-or-nothing validation: invalid move leaves store untouched
    await expect(
      fx.handlers.fn_batchRebalanceProjects(
        invoke('fn_batchRebalanceProjects', {
          projectUpdates: [{ projectId: fx.ids.websiteId, area: 'ShouldNotApply' }],
          deliverableMoves: [
            {
              fromProjectId: fx.ids.grantId,
              deliverableId: 'del_missing',
              toProjectId: fx.ids.websiteId,
            },
          ],
        }),
      ),
    ).rejects.toThrow(AgentProjectsToolError)
    expect(fx.getStore().projects.find(p => p.id === fx.ids.websiteId)!.area).toBe('Comms')
  })

  it('fn_prepareHandoverPackage generates status brief, exports PDFs and ZIP, and logs journal', async () => {
    const fx = makeRichFixture()

    const parsed = JSON.parse(
      (
        await fx.handlers.fn_prepareHandoverPackage(
          invoke('fn_prepareHandoverPackage', {
            format: 'both',
            includeStatusBrief: true,
            logHandoverInJournal: true,
            journalNote: 'Prepared for steering committee review.',
          }),
        )
      ).content as string,
    )

    expect(parsed.ok).toBe(true)
    expect(parsed.data.statusBrief).toMatchObject({
      name: 'Autumn Grant Application — Status Brief',
    })
    expect(parsed.data.includedDocuments).toBe(3) // original .document + attached pdf + new status brief
    expect(parsed.data.writtenPdfs).toHaveLength(2) // 2 .document packages
    expect(parsed.data.skippedAttachedFiles).toBe(1) // 1 attached pdf
    expect(parsed.data.zipPath).toContain('.zip')
    expect(parsed.data.artifactPaths).toHaveLength(3)
    expect(parsed.data.journalLogged).toBe(true)

    const grant = fx.getStore().projects.find(p => p.id === fx.ids.grantId)!
    expect(grant.journal[0]!.title).toContain('handover package')

    // Refuses project with no exportable documents when includeStatusBrief is false
    await expect(
      fx.handlers.fn_prepareHandoverPackage(
        invoke('fn_prepareHandoverPackage', {
          projectId: fx.ids.websiteId,
          format: 'zip',
        }),
      ),
    ).rejects.toThrow(AgentProjectsToolError)
  })
})

describe('PureProjects Core Atomic Tools & Extended Escape-Hatch Routing', () => {
  it('runs direct core tools including open-project addDeliverable and permanent-delete deleteProject', async () => {
    const fx = makeRichFixture()

    const ctxRes = JSON.parse(
      (await fx.handlers.getProjectsContext(invoke('getProjectsContext'))).content as string,
    )
    expect(ctxRes.openProject.id).toBe(fx.ids.grantId)

    const listRes = JSON.parse(
      (await fx.handlers.listProjects(invoke('listProjects', { area: 'Comms' }))).content as string,
    )
    expect(listRes.count).toBe(2)

    const getRes = JSON.parse(
      (
        await fx.handlers.getProject(
          invoke('getProject', { projectId: fx.ids.grantId }),
        )
      ).content as string,
    )
    expect(getRes.name).toBe('Autumn Grant Application')

    const addRes = JSON.parse(
      (
        await fx.handlers.addDeliverable(
          invoke('addDeliverable', { title: 'Verify submission portal' }),
        )
      ).content as string,
    )
    expect(addRes).toMatchObject({ added: true, projectId: fx.ids.grantId })

    // deleteProject refuses mismatched name
    const badDel = await fx.handlers.deleteProject(
      invoke('deleteProject', { projectId: fx.ids.workshopId, name: 'Wrong Name' }),
    )
    expect(badDel.isError).toBe(true)

    // deleteProject deletes when exact name matches
    const goodDel = JSON.parse(
      (
        await fx.handlers.deleteProject(
          invoke('deleteProject', {
            projectId: fx.ids.workshopId,
            name: 'November Workshop',
          }),
        )
      ).content as string,
    )
    expect(goodDel.deleted).toBe(true)
    expect(fx.getStore().projects.some(p => p.id === fx.ids.workshopId)).toBe(false)
  })

  it('discovers extended tools via discoverAppTools by category, query, and exact names', async () => {
    const fx = makeRichFixture()

    const docCategory = JSON.parse(
      (
        await fx.handlers.discoverAppTools(
          invoke('discoverAppTools', { category: 'documents' }),
        )
      ).content as string,
    )
    expect(docCategory.operations).toHaveLength(5)
    expect(
      docCategory.operations.find((op: { name: string }) => op.name === 'readDocument')
        ?.invokeVia,
    ).toBe('callExtendedReadTool')

    const byName = JSON.parse(
      (
        await fx.handlers.discoverAppTools(
          invoke('discoverAppTools', {
            names: ['readDocument', 'archiveProject', 'deleteProject', 'doesNotExist'],
          }),
        )
      ).content as string,
    )
    expect(byName.operations[0]).toMatchObject({
      name: 'readDocument',
      found: true,
      invokeVia: 'callExtendedReadTool',
    })
    expect(byName.operations[1]).toMatchObject({
      name: 'archiveProject',
      found: true,
      invokeVia: 'callExtendedTool',
      requiresConfirmDestructive: true,
    })
    expect(byName.operations[2]).toMatchObject({
      name: 'deleteProject',
      found: true,
      invokeVia: 'direct',
    })
    expect(byName.operations[3]).toMatchObject({
      name: 'doesNotExist',
      found: false,
    })
  })

  it('routes read-only extended tools through callExtendedReadTool and refuses mutating/direct tools', async () => {
    const fx = makeRichFixture()

    const doc = JSON.parse(
      (
        await fx.handlers.callExtendedReadTool(
          invoke('callExtendedReadTool', {
            tool: 'readDocument',
            arguments: { path: fx.ids.docPath },
          }),
        )
      ).content as string,
    )
    expect(doc.blockCount).toBe(4)

    await expect(
      fx.handlers.callExtendedReadTool(
        invoke('callExtendedReadTool', {
          tool: 'setWaitingOn',
          arguments: { projectId: fx.ids.grantId, person: 'Sam' },
        }),
      ),
    ).rejects.toThrow(/callExtendedTool/)

    await expect(
      fx.handlers.callExtendedReadTool(
        invoke('callExtendedReadTool', { tool: 'getProject' }),
      ),
    ).rejects.toThrow(/directly/)
  })

  it('routes mutating extended tools through callExtendedTool and gates destructive calls', async () => {
    const fx = makeRichFixture()

    // Non-destructive extended write works directly
    const waitRes = JSON.parse(
      (
        await fx.handlers.callExtendedTool(
          invoke('callExtendedTool', {
            tool: 'setWaitingOn',
            arguments: {
              projectId: fx.ids.websiteId,
              person: 'Design Studio',
              what: 'Logo SVGs',
            },
          }),
        )
      ).content as string,
    )
    expect(waitRes.status).toBe('waiting')

    // Document block insert via extended tool
    const insertRes = JSON.parse(
      (
        await fx.handlers.callExtendedTool(
          invoke('callExtendedTool', {
            tool: 'insertDocumentBlock',
            arguments: { path: fx.ids.docPath, html: '<p>Added appendix.</p>' },
          }),
        )
      ).content as string,
    )
    expect(insertRes.inserted).toBe(true)
    expect(insertRes.blockCount).toBe(5)

    // Refuses read-only extended tool
    await expect(
      fx.handlers.callExtendedTool(
        invoke('callExtendedTool', {
          tool: 'readDocument',
          arguments: { path: fx.ids.docPath },
        }),
      ),
    ).rejects.toThrow(/callExtendedReadTool/)

    // Refuses directly exposed permanent-delete tool
    await expect(
      fx.handlers.callExtendedTool(
        invoke('callExtendedTool', {
          tool: 'deleteProject',
          arguments: { projectId: fx.ids.workshopId, name: 'November Workshop' },
          confirmDestructive: true,
        }),
      ),
    ).rejects.toThrow(/directly/)

    // Refuses destructive extended tool without confirmDestructive: true
    await expect(
      fx.handlers.callExtendedTool(
        invoke('callExtendedTool', {
          tool: 'archiveProject',
          arguments: { projectId: fx.ids.workshopId },
        }),
      ),
    ).rejects.toThrow(/confirmDestructive/)

    // Succeeds with confirmDestructive: true
    const archived = JSON.parse(
      (
        await fx.handlers.callExtendedTool(
          invoke('callExtendedTool', {
            tool: 'archiveProject',
            arguments: { projectId: fx.ids.workshopId },
            confirmDestructive: true,
          }),
        )
      ).content as string,
    )
    expect(archived.archived).toBe(true)

    // Destructive link removal also gated and succeeds when confirmed
    await expect(
      fx.handlers.callExtendedTool(
        invoke('callExtendedTool', {
          tool: 'removeLink',
          arguments: { projectId: fx.ids.grantId, linkId: fx.ids.grantLinkWeb },
        }),
      ),
    ).rejects.toThrow(/confirmDestructive/)

    const unlinked = JSON.parse(
      (
        await fx.handlers.callExtendedTool(
          invoke('callExtendedTool', {
            tool: 'removeLink',
            arguments: { projectId: fx.ids.grantId, linkId: fx.ids.grantLinkWeb },
            confirmDestructive: true,
          }),
        )
      ).content as string,
    )
    expect(unlinked.removed).toBe(true)
  })
})
