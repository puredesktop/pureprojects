import {
  agentToolErrorContent,
  formatAgentToolJson,
  readAgentToolStringArg,
} from '@purescience/platform-ui/bridge/agentToolHelpers'
import type { AgentToolHandlerResult } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import {
  addDeliverable,
  archiveProject,
  archivedProjects,
  completedCount,
  createProject,
  daysUntil,
  hasNoNextAction,
  isOverdue,
  isProjectStatus,
  linkDocument,
  applyManualOrder,
  livingProjects,
  logJournalEntry,
  matchesQuery,
  moveDeliverable,
  removeDeliverable,
  removeLink,
  restoreProject,
  addWaitingOn,
  resolveWaitingOn,
  sortForDisplay,
  sortForList,
  summarize,
  touch,
  updateDeliverable,
} from '../lib/projectModel'
import { findProject, type ProjectsAgentToolContext } from './catalog'
import { isDocumentPackage } from '../lib/projectDocument'
import { exportableDocuments } from '../lib/documentExport'
import {
  deleteDocumentBlock,
  insertDocumentBlock,
  mermaidBlockHtml,
  readDocumentBlocks,
  replaceDocumentBlock,
} from '../lib/documentBlocks'
import type { LinkKind, Project, ProjectStatus, ProjectsStore } from '../types'

function readStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key]
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string')
}

/** Compact shape the model reads — never the whole record. */
function projectLine(project: Project, now: Date): Record<string, unknown> {
  const days = daysUntil(project.dueAt, now)
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    ...(project.area ? { area: project.area } : {}),
    ...(project.archivedAt ? { archived: true, archivedAt: project.archivedAt } : {}),
    nextAction: project.nextAction || null,
    ...(project.dueAt ? { dueAt: project.dueAt, daysUntilDue: days } : {}),
    ...(isOverdue(project, now) ? { overdue: true } : {}),
    ...(project.waitingOn.length
      ? {
          waitingOn: project.waitingOn.map(wait => ({
            waitingId: wait.id,
            on: `${wait.person} — ${wait.what || 'unspecified'}`,
            askedAt: wait.askedAt,
          })),
        }
      : {}),
    ...(project.people.length ? { people: project.people } : {}),
    deliverables: `${completedCount(project)}/${project.deliverables.length}`,
  }
}

export async function getProjectsContextHandler(
  context: ProjectsAgentToolContext,
): Promise<AgentToolHandlerResult> {
  const now = context.now()
  // Same rule the UI follows: archived projects are out of view, so they are
  // out of the summary, out of needsAttention and out of the area list. An
  // agent nagging about a project the user filed months ago is the bug.
  const projects = livingProjects((await context.refresh()).projects)
  const summary = summarize(projects, now)
  const attention = sortForList(
    projects.filter(
      project =>
        project.status !== 'done' &&
        (isOverdue(project, now) ||
          project.waitingOn.length > 0 ||
          hasNoNextAction(project)),
    ),
    now,
  )
  const openId = context.openProjectId()
  const open = openId ? projects.find(project => project.id === openId) : undefined
  return {
    content: formatAgentToolJson({
      // What the user is looking at. "This project", "the project", "it" and
      // an unqualified "make a document" all mean this one.
      openProject: open ? { id: open.id, name: open.name } : null,
      summary,
      needsAttention: attention.map(project => projectLine(project, now)),
      areas: [...new Set(projects.map(project => project.area).filter(Boolean))],
      usage:
        'Statuses: idea, active, waiting, done. "waiting" means the ball is ' +
        'with other people — record each one with setWaitingOn rather than ' +
        'leaving a project active; a project can be waiting on several at ' +
        'once, and clearing one names which arrived (resolveWaitingId). The ' +
        'status follows the list: it returns to active when the last wait ' +
        'clears. A project with no next action is a defect worth raising.',
    }),
  }
}

export async function listProjectsHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const now = context.now()
  const store = await context.refresh()
  const status = readAgentToolStringArg(args, 'status')?.trim()
  if (status && !isProjectStatus(status)) {
    return agentToolErrorContent('status must be one of: idea, active, waiting, done')
  }
  const area = readAgentToolStringArg(args, 'area')?.trim().toLowerCase()
  const query = readAgentToolStringArg(args, 'query') ?? ''
  // Archived is a deliberate ask, never a default: listing filed work beside
  // live work is how an agent ends up acting on something long since put away.
  const wantArchived = args.archived === true
  const pool = wantArchived
    ? archivedProjects(store.projects)
    : livingProjects(store.projects)
  const matched = pool.filter(project => {
    if (status && project.status !== status) return false
    if (area && project.area.toLowerCase() !== area) return false
    return matchesQuery(project, query)
  })
  return {
    content: formatAgentToolJson({
      count: matched.length,
      projects: sortForList(matched, now).map(project => projectLine(project, now)),
    }),
  }
}

export async function getProjectHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const projectId = readAgentToolStringArg(args, 'projectId')?.trim()
  if (!projectId) return agentToolErrorContent('projectId is required')
  const project = findProject(await context.refresh(), projectId)
  if (!project) {
    return agentToolErrorContent(
      `no project ${projectId} — call listProjects for current ids`,
    )
  }
  const now = context.now()
  return {
    content: formatAgentToolJson({
      ...projectLine(project, now),
      summary: project.summary || null,
      deliverableList: project.deliverables.map(deliverable => ({
        id: deliverable.id,
        title: deliverable.title,
        owner: deliverable.owner || 'you',
        dueAt: deliverable.dueAt || null,
        done: !!deliverable.doneAt,
      })),
      journal: project.journal.slice(0, 10).map(entry => ({
        at: entry.at.slice(0, 10),
        title: entry.title,
        body: entry.body,
      })),
      links: project.links.map(link => ({
        label: link.label,
        path: link.path,
        kind: link.kind,
      })),
    }),
  }
}

async function withProject(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
  change: (project: Project, now: string) => Project,
): Promise<{ ok: true; project: Project } | { ok: false; error: string }> {
  const projectId = readAgentToolStringArg(args, 'projectId')?.trim()
  if (!projectId) return { ok: false, error: 'projectId is required' }
  if (!findProject(await context.refresh(), projectId)) {
    return {
      ok: false,
      error: `no project ${projectId} — call listProjects for current ids`,
    }
  }
  const nowIso = context.now().toISOString()
  let updated: Project | undefined
  await context.mutate((store: ProjectsStore) => ({
    ...store,
    projects: store.projects.map(project => {
      if (project.id !== projectId) return project
      updated = change(project, nowIso)
      return updated
    }),
  }))
  if (!updated) return { ok: false, error: 'the project could not be updated' }
  context.focusProject(projectId)
  return { ok: true, project: updated }
}

export async function createProjectHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const name = readAgentToolStringArg(args, 'name')?.trim()
  if (!name) return agentToolErrorContent('name is required')
  const nowIso = context.now().toISOString()
  const project = createProject(
    {
      name,
      summary: readAgentToolStringArg(args, 'summary') ?? '',
      area: readAgentToolStringArg(args, 'area') ?? '',
      nextAction: readAgentToolStringArg(args, 'nextAction') ?? '',
      dueAt: readAgentToolStringArg(args, 'dueAt') ?? '',
      people: readStringArray(args, 'people') ?? [],
    },
    nowIso,
  )
  await context.mutate(store => ({ ...store, projects: [...store.projects, project] }))
  context.focusProject(project.id)
  return {
    content: formatAgentToolJson({
      created: true,
      projectId: project.id,
      name: project.name,
      ...(project.nextAction
        ? {}
        : { note: 'No next action set — the project will show as needing one.' }),
    }),
  }
}

export async function updateProjectHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const statusArg = readAgentToolStringArg(args, 'status')?.trim()
  if (statusArg && !isProjectStatus(statusArg)) {
    return agentToolErrorContent('status must be one of: idea, active, waiting, done')
  }
  const status: ProjectStatus | undefined = isProjectStatus(statusArg)
    ? statusArg
    : undefined
  if (status === 'waiting') {
    return agentToolErrorContent(
      'set waiting with setWaitingOn, which records who and what for — a waiting project with nobody named is a stall nobody can chase',
    )
  }
  // The helper returns null for an absent arg; the patch below distinguishes
  // "not passed" from "passed empty", so normalize null to undefined once.
  const name = readAgentToolStringArg(args, 'name') ?? undefined
  const summary = readAgentToolStringArg(args, 'summary') ?? undefined
  const area = readAgentToolStringArg(args, 'area') ?? undefined
  const nextAction = readAgentToolStringArg(args, 'nextAction') ?? undefined
  const dueAt = 'dueAt' in args ? (readAgentToolStringArg(args, 'dueAt') ?? '') : undefined
  const people = readStringArray(args, 'people')

  const result = await withProject(context, args, (project, now) =>
    touch(
      {
        ...project,
        ...(name !== undefined ? { name } : {}),
        ...(summary !== undefined ? { summary } : {}),
        ...(area !== undefined ? { area } : {}),
        ...(nextAction !== undefined ? { nextAction } : {}),
        ...(dueAt !== undefined ? { dueAt } : {}),
        ...(people !== undefined ? { people } : {}),
        ...(status
          ? {
              status,
              closedAt: status === 'done' ? now : null,
              // Closing or reopening settles the wait too: a done project
              // waiting on someone reads as a stall that never cleared.
              ...(status === 'done' ? { waitingOn: [] } : {}),
            }
          : {}),
      },
      now,
    ),
  )
  if (!result.ok) return agentToolErrorContent(result.error)
  return {
    content: formatAgentToolJson({
      updated: true,
      ...projectLine(result.project, context.now()),
    }),
  }
}

export async function addDeliverableHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const title = readAgentToolStringArg(args, 'title')?.trim()
  if (!title) return agentToolErrorContent('title is required')
  const owner = readAgentToolStringArg(args, 'owner') ?? ''
  const dueAt = readAgentToolStringArg(args, 'dueAt') ?? ''
  const result = await withProject(context, args, (project, now) =>
    addDeliverable(project, { title, owner, dueAt }, now),
  )
  if (!result.ok) return agentToolErrorContent(result.error)
  const added = result.project.deliverables[result.project.deliverables.length - 1]
  return {
    content: formatAgentToolJson({
      added: true,
      deliverableId: added?.id,
      title,
      deliverables: `${completedCount(result.project)}/${result.project.deliverables.length}`,
    }),
  }
}

export async function updateDeliverableHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const deliverableId = readAgentToolStringArg(args, 'deliverableId')?.trim()
  if (!deliverableId) return agentToolErrorContent('deliverableId is required')
  const projectId = readAgentToolStringArg(args, 'projectId')?.trim() ?? ''
  const project = findProject(await context.refresh(), projectId)
  if (project && !project.deliverables.some(item => item.id === deliverableId)) {
    return agentToolErrorContent(
      `no deliverable ${deliverableId} on ${project.name} — call getProject for current ids`,
    )
  }
  const done = typeof args.done === 'boolean' ? (args.done as boolean) : undefined
  const title = readAgentToolStringArg(args, 'title') ?? undefined
  const owner = readAgentToolStringArg(args, 'owner') ?? undefined
  const dueAt = readAgentToolStringArg(args, 'dueAt') ?? undefined
  const result = await withProject(context, args, (current, now) =>
    updateDeliverable(current, deliverableId, { title, owner, dueAt, done }, now),
  )
  if (!result.ok) return agentToolErrorContent(result.error)
  return {
    content: formatAgentToolJson({
      updated: true,
      deliverables: `${completedCount(result.project)}/${result.project.deliverables.length}`,
    }),
  }
}

export async function setWaitingOnHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const person = readAgentToolStringArg(args, 'person')?.trim() ?? ''
  const what = readAgentToolStringArg(args, 'what')?.trim() ?? ''
  const resolveId = readAgentToolStringArg(args, 'resolveWaitingId')?.trim()
  const askedAt =
    readAgentToolStringArg(args, 'askedAt')?.trim() ||
    context.now().toISOString().slice(0, 10)
  if (person && resolveId) {
    return agentToolErrorContent(
      'pass either person (to add a wait) or resolveWaitingId (to clear one), not both',
    )
  }
  // A project can be waiting on several people at once, so adding is
  // additive and clearing names WHICH wait arrived — omitting both
  // clears them all, which is how "it all landed" is said.
  const result = await withProject(context, args, (project, now) =>
    person
      ? addWaitingOn(project, { person, what, askedAt }, now)
      : resolveWaitingOn(project, resolveId ?? null, now),
  )
  if (!result.ok) return agentToolErrorContent(result.error)
  return {
    content: formatAgentToolJson({
      updated: true,
      status: result.project.status,
      waitingOn: result.project.waitingOn.map(wait => ({
        waitingId: wait.id,
        on: `${wait.person} — ${wait.what || 'unspecified'}`,
        askedAt: wait.askedAt,
      })),
    }),
  }
}

export async function logJournalEntryHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const title = readAgentToolStringArg(args, 'title')?.trim()
  if (!title) return agentToolErrorContent('title is required')
  const body = readAgentToolStringArg(args, 'body') ?? ''
  const result = await withProject(context, args, (project, now) =>
    logJournalEntry(project, { title, body }, now),
  )
  if (!result.ok) return agentToolErrorContent(result.error)
  return {
    content: formatAgentToolJson({
      logged: true,
      entries: result.project.journal.length,
      title,
    }),
  }
}

export async function linkDocumentHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const label = readAgentToolStringArg(args, 'label')?.trim()
  const path = readAgentToolStringArg(args, 'path')?.trim()
  if (!label) return agentToolErrorContent('label is required')
  if (!path) return agentToolErrorContent('path is required')
  const kindArg = readAgentToolStringArg(args, 'kind')?.trim()
  if (
    kindArg &&
    kindArg !== 'document' &&
    kindArg !== 'mail' &&
    kindArg !== 'event' &&
    kindArg !== 'web'
  ) {
    return agentToolErrorContent(
      'kind must be one of: document, mail, event, web',
    )
  }
  const result = await withProject(context, args, (project, now) =>
    linkDocument(
      project,
      {
        label,
        path,
        // The path is the authority: an http(s) address is a web link
        // even when the caller left the kind off or guessed 'document'.
        kind: /^https?:\/\//i.test(path)
          ? 'web'
          : (kindArg as LinkKind | undefined),
      },
      now,
    ),
  )
  if (!result.ok) return agentToolErrorContent(result.error)
  return {
    content: formatAgentToolJson({
      linked: true,
      links: result.project.links.length,
      label,
    }),
  }
}

export async function removeDeliverableHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const deliverableId = readAgentToolStringArg(args, 'deliverableId')?.trim()
  if (!deliverableId) return agentToolErrorContent('deliverableId is required')
  const result = await withProject(context, args, (project, now) =>
    removeDeliverable(project, deliverableId, now),
  )
  if (!result.ok) return agentToolErrorContent(result.error)
  return {
    content: formatAgentToolJson({
      removed: true,
      deliverables: `${completedCount(result.project)}/${result.project.deliverables.length}`,
    }),
  }
}

export async function moveDeliverableHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const projectId = readAgentToolStringArg(args, 'projectId')?.trim()
  const deliverableId = readAgentToolStringArg(args, 'deliverableId')?.trim()
  const toProjectId = readAgentToolStringArg(args, 'toProjectId')?.trim()
  if (!projectId) return agentToolErrorContent('projectId is required')
  if (!deliverableId) return agentToolErrorContent('deliverableId is required')
  if (!toProjectId) return agentToolErrorContent('toProjectId is required')
  const store = await context.refresh()
  const from = findProject(store, projectId)
  const to = findProject(store, toProjectId)
  if (!from) return agentToolErrorContent(`no project ${projectId} — call listProjects for current ids`)
  if (!to) return agentToolErrorContent(`no project ${toProjectId} — call listProjects for current ids`)
  const deliverable = from.deliverables.find(item => item.id === deliverableId)
  if (!deliverable) {
    return agentToolErrorContent(
      `no deliverable ${deliverableId} on ${from.name} — getProject lists its deliverable ids`,
    )
  }
  if (from.id === to.id) return agentToolErrorContent('that deliverable is already in that project')
  const nowIso = context.now().toISOString()
  await context.mutate((current: ProjectsStore) =>
    moveDeliverable(current, { fromProjectId: from.id, deliverableId, toProjectId: to.id }, nowIso),
  )
  return {
    content: formatAgentToolJson({
      moved: true,
      deliverableId,
      title: deliverable.title,
      from: { projectId: from.id, name: from.name },
      to: { projectId: to.id, name: to.name },
    }),
  }
}

export async function removeLinkHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const linkId = readAgentToolStringArg(args, 'linkId')?.trim()
  if (!linkId) return agentToolErrorContent('linkId is required')
  const result = await withProject(context, args, (project, now) =>
    removeLink(project, linkId, now),
  )
  if (!result.ok) return agentToolErrorContent(result.error)
  return {
    content: formatAgentToolJson({ removed: true, links: result.project.links.length }),
  }
}

/**
 * Deleting takes the project's exact current name as a second key. An id
 * alone is easy to carry over from a stale listing, and this is the one
 * call in the app that destroys work outright.
 */
export async function deleteProjectHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const projectId = readAgentToolStringArg(args, 'projectId')?.trim()
  const name = readAgentToolStringArg(args, 'name')?.trim()
  if (!projectId) return agentToolErrorContent('projectId is required')
  if (!name) return agentToolErrorContent('name is required — it guards against deleting the wrong project')
  const project = findProject(await context.refresh(), projectId)
  if (!project) {
    return agentToolErrorContent(
      `no project ${projectId} — call listProjects for current ids`,
    )
  }
  if (project.name.trim().toLowerCase() !== name.toLowerCase()) {
    return agentToolErrorContent(
      `${projectId} is "${project.name}", not "${name}" — re-read listProjects and retry if you meant this one`,
    )
  }
  await context.mutate(store => ({
    ...store,
    projects: store.projects.filter(item => item.id !== projectId),
  }))
  return {
    content: formatAgentToolJson({
      deleted: true,
      name: project.name,
      note: 'Permanent. Closing a project with status done keeps the record instead.',
    }),
  }
}

/**
 * Archiving is the safe counterpart to deleting: everything is kept, the
 * project simply leaves the views. No name guard and no approval gate, because
 * archiving the wrong project costs one call to put back.
 */
export async function archiveProjectHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const projectId = readAgentToolStringArg(args, 'projectId')?.trim()
  if (!projectId) return agentToolErrorContent('projectId is required')
  const archived = typeof args.archived === 'boolean' ? args.archived : true
  const project = findProject(await context.refresh(), projectId)
  if (!project) {
    return agentToolErrorContent(
      `no project ${projectId} — call listProjects for current ids`,
    )
  }
  const at = new Date().toISOString()
  await context.mutate(store => ({
    ...store,
    projects: store.projects.map(item =>
      item.id === projectId
        ? archived
          ? archiveProject(item, at)
          : restoreProject(item, at)
        : item,
    ),
  }))
  return {
    content: formatAgentToolJson({
      projectId,
      name: project.name,
      archived,
      status: project.status,
      note: archived
        ? 'Out of the lists and counts. Nothing was lost; call again with archived false to bring it back.'
        : 'Back in view, standing exactly where it did.',
    }),
  }
}

/** The linked document at `path`, or an error naming what to call instead. */
async function requireLinkedDocument(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<{ path: string; html: string } | AgentToolHandlerResult> {
  const path = readAgentToolStringArg(args, 'path')?.trim()
  if (!path) return agentToolErrorContent('path is required')
  if (!isDocumentPackage(path)) {
    return agentToolErrorContent(
      `${path} is not a .document package — only documents this app created can be edited here`,
    )
  }
  const store = await context.refresh()
  const linked = store.projects.some(project =>
    project.links.some(link => link.path === path),
  )
  if (!linked) {
    // Refusing an unlinked path keeps the agent inside the projects it was
    // asked about, and makes a stale path an error rather than a silent write
    // to some other document that happens to share a name.
    return agentToolErrorContent(
      `no project links ${path} — call getProject for the documents on a project`,
    )
  }
  try {
    return { path, html: await context.readDocument(path) }
  } catch (error) {
    return agentToolErrorContent(
      `could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function isHandlerResult(
  value: { path: string; html: string } | AgentToolHandlerResult,
): value is AgentToolHandlerResult {
  return 'content' in value
}

export async function readDocumentHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const found = await requireLinkedDocument(context, args)
  if (isHandlerResult(found)) return found
  const blocks = readDocumentBlocks(context.documentExtensions(), found.html)
  return {
    content: formatAgentToolJson({
      path: found.path,
      blockCount: blocks.length,
      blocks,
      note: 'Edit by block index. Indexes shift after every insert or delete — read again before the next edit.',
    }),
  }
}

/** Shared tail: write the new html, report the document as it now stands. */
async function commitDocument(
  context: ProjectsAgentToolContext,
  path: string,
  html: string | null,
  failure: string,
): Promise<AgentToolHandlerResult> {
  if (html === null) return agentToolErrorContent(failure)
  try {
    await context.writeDocument(path, html)
  } catch (error) {
    return agentToolErrorContent(
      `could not write ${path}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const blocks = readDocumentBlocks(context.documentExtensions(), html)
  return {
    content: formatAgentToolJson({
      path,
      blockCount: blocks.length,
      blocks,
    }),
  }
}

export async function insertDocumentBlockHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const found = await requireLinkedDocument(context, args)
  if (isHandlerResult(found)) return found
  const mermaid = readAgentToolStringArg(args, 'mermaid')?.trim()
  const html = readAgentToolStringArg(args, 'html')?.trim()
  if (!mermaid && !html) {
    return agentToolErrorContent('pass html, or mermaid for a diagram')
  }
  const markup = mermaid ? mermaidBlockHtml(mermaid) : (html as string)
  const at = readAgentToolStringArg(args, 'at')?.trim() ?? 'end'
  const rawIndex = args.index
  const index = typeof rawIndex === 'number' ? rawIndex : undefined
  if (at !== 'end' && index === undefined) {
    return agentToolErrorContent(`index is required when at is "${at}"`)
  }
  const position =
    at === 'before'
      ? ({ at: 'before', index: index as number } as const)
      : at === 'after'
        ? ({ at: 'after', index: index as number } as const)
        : ({ at: 'end' } as const)
  return commitDocument(
    context,
    found.path,
    insertDocumentBlock(
      context.documentExtensions(),
      found.html,
      markup,
      position,
    ),
    `no block ${index} in ${found.path} — call readDocument for current indexes`,
  )
}

export async function replaceDocumentBlockHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const found = await requireLinkedDocument(context, args)
  if (isHandlerResult(found)) return found
  const index = args.index
  if (typeof index !== 'number') return agentToolErrorContent('index is required')
  const mermaid = readAgentToolStringArg(args, 'mermaid')?.trim()
  const html = readAgentToolStringArg(args, 'html')?.trim()
  if (!mermaid && !html) {
    return agentToolErrorContent('pass html, or mermaid for a diagram')
  }
  return commitDocument(
    context,
    found.path,
    replaceDocumentBlock(
      context.documentExtensions(),
      found.html,
      index,
      mermaid ? mermaidBlockHtml(mermaid) : (html as string),
    ),
    `no block ${index} in ${found.path} — call readDocument for current indexes`,
  )
}

export async function deleteDocumentBlockHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const found = await requireLinkedDocument(context, args)
  if (isHandlerResult(found)) return found
  const index = args.index
  if (typeof index !== 'number') return agentToolErrorContent('index is required')
  return commitDocument(
    context,
    found.path,
    deleteDocumentBlock(context.documentExtensions(), found.html, index),
    `no block ${index} in ${found.path} — call readDocument for current indexes`,
  )
}

/** The project an export names, or an error saying how to find one. */
async function requireProject(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<Project | AgentToolHandlerResult> {
  const projectId =
    readAgentToolStringArg(args, 'projectId')?.trim() || context.openProjectId()
  if (!projectId) {
    return agentToolErrorContent(
      'projectId is required — no project is open, so there is nothing for "this project" to mean',
    )
  }
  const project = findProject(await context.refresh(), projectId)
  return (
    project ??
    agentToolErrorContent(
      `no project ${projectId} — call listProjects for current ids`,
    )
  )
}

/** Every document on the project, or the subset the caller named. */
function chosenPaths(
  project: Project,
  args: Record<string, unknown>,
): string[] {
  const asked = Array.isArray(args.paths)
    ? args.paths.filter((item): item is string => typeof item === 'string')
    : null
  const all = exportableDocuments(project.links).map(item => item.packagePath)
  // No paths means the whole project, which is what "export the documents on
  // this matter" asks for; naming some means only those.
  return asked && asked.length > 0 ? all.filter(path => asked.includes(path)) : all
}

export async function exportDocumentsPdfHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const project = await requireProject(context, args)
  if ('content' in project) return project
  const paths = chosenPaths(project, args)
  if (paths.length === 0) {
    return agentToolErrorContent(
      `${project.name} has no documents to export — link or create one first`,
    )
  }
  try {
    const { written, skipped } = await context.exportDocumentsPdf(
      project.id,
      paths,
    )
    if (written.length === 0) {
      return agentToolErrorContent(
        'Nothing here can be converted — PDFs are made from documents written in this app, not from files attached to the project.',
      )
    }
    return {
      content: formatAgentToolJson({
        project: { id: project.id, name: project.name },
        written,
        artifactPaths: written,
        // Attached files are reported rather than silently ignored: printing
        // three of five and saying nothing is how a person sends an
        // incomplete set believing it is complete.
        skippedAttachedFiles: skipped,
      }),
    }
  } catch (error) {
    return agentToolErrorContent(
      `could not export: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function exportProjectZipHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const project = await requireProject(context, args)
  if ('content' in project) return project
  const paths = chosenPaths(project, args)
  if (paths.length === 0) {
    return agentToolErrorContent(
      `${project.name} has no documents to export — link or create one first`,
    )
  }
  try {
    const written = await context.exportProjectZip(project.id, paths)
    return {
      content: formatAgentToolJson({
        project: { id: project.id, name: project.name },
        path: written,
        artifactPaths: [written],
        included: paths.length,
        note: 'Documents written in this app went in as PDFs; attached files went in as themselves.',
      }),
    }
  } catch (error) {
    return agentToolErrorContent(
      `could not write the zip: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function reorderProjectHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const projectId = readAgentToolStringArg(args, 'projectId')?.trim()
  if (!projectId) return agentToolErrorContent('projectId is required')
  const at = readAgentToolStringArg(args, 'at')?.trim() ?? 'top'
  const targetId = readAgentToolStringArg(args, 'targetProjectId')?.trim()
  if ((at === 'before' || at === 'after') && !targetId) {
    return agentToolErrorContent(`targetProjectId is required when at is "${at}"`)
  }
  const now = context.now()
  const store = await context.refresh()
  if (!findProject(store, projectId)) {
    return agentToolErrorContent(
      `no project ${projectId} — call listProjects for current ids`,
    )
  }
  const ordered = sortForDisplay(livingProjects(store.projects), now)
  const ids = ordered.map(project => project.id).filter(id => id !== projectId)
  if (at === 'top') ids.unshift(projectId)
  else if (at === 'bottom') ids.push(projectId)
  else {
    const index = ids.indexOf(targetId as string)
    if (index === -1) {
      return agentToolErrorContent(
        `no project ${targetId} to place it against — call listProjects for current ids`,
      )
    }
    ids.splice(at === 'before' ? index : index + 1, 0, projectId)
  }
  const at_iso = now.toISOString()
  await context.mutate(current => ({
    ...current,
    projects: applyManualOrder(current.projects, ids, at_iso),
  }))
  context.focusProject(projectId)
  return {
    content: formatAgentToolJson({
      order: ids,
      note: 'The list now keeps this arrangement instead of sorting by urgency.',
    }),
  }
}

export async function createDocumentHandler(
  context: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  // Fall back to the project on screen. An unqualified "make a document"
  // means the one the user is looking at, and guessing an id is how a
  // document ends up filed under someone else's project.
  const projectId =
    readAgentToolStringArg(args, 'projectId')?.trim() || context.openProjectId()
  const title = readAgentToolStringArg(args, 'title')?.trim()
  if (!projectId) {
    return agentToolErrorContent(
      'projectId is required — no project is open, so there is nothing for "this project" to mean',
    )
  }
  if (!title) return agentToolErrorContent('title is required')
  const project = findProject(await context.refresh(), projectId)
  if (!project) {
    return agentToolErrorContent(
      `no project ${projectId} — call listProjects for current ids`,
    )
  }
  const html = readAgentToolStringArg(args, 'html') ?? undefined
  try {
    const created = await context.createDocument({ projectId, title, html })
    context.focusProject(projectId)
    return {
      content: formatAgentToolJson({
        created: true,
        // Name the project it landed in, so filing it under the wrong one is
        // visible in the answer rather than discovered later.
        project: { id: project.id, name: project.name },
        name: created.name,
        path: created.path,
        linkedTo: project.name,
        usage:
          'A PureWriter .document package. Edit it here, in Writer, or through ' +
          'the writer agent tools — they all read the same file.',
      }),
    }
  } catch (error) {
    return agentToolErrorContent(
      error instanceof Error
        ? `the document could not be created — ${error.message}`
        : 'the document could not be created',
    )
  }
}
