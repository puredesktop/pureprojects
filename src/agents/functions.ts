/**
 * High-level composite PureProjects App Functions (`fn_*`).
 *
 * Each function collapses 3–15 atomic tool round-trips into one auditable call
 * built on PureProjects' own deterministic domain model (`projectModel`,
 * `projectDocument`, `documentExport`, `documentBlocks`) and routing every
 * mutation atomically through `context.mutate`.
 */
import {
  defineAppFunction,
  type AppFunctionDefinition,
} from '@purescience/platform-ui/bridge/appFunctions'
import { readDocumentBlocks } from '../lib/documentBlocks'
import { exportableDocuments } from '../lib/documentExport'
import { isDocumentPackage } from '../lib/projectDocument'
import {
  addDeliverable,
  addWaitingOn,
  archiveProject,
  archivedProjects,
  completedCount,
  createProject,
  daysUntil,
  hasNoNextAction,
  isArchived,
  isOverdue,
  isProjectStatus,
  linkDocument,
  livingProjects,
  logJournalEntry,
  matchesQuery,
  moveDeliverable,
  nextDeliverable,
  resolveWaitingOn,
  restoreProject,
  setNextActionFromDeliverable,
  sortForList,
  summarize,
  touch,
  updateDeliverable,
} from '../lib/projectModel'
import type {
  Deliverable,
  LinkKind,
  Project,
  ProjectStatus,
  ProjectsStore,
} from '../types'
import {
  AgentProjectsToolError,
  findProject,
  type ProjectsAgentToolContext,
} from './catalog'

const DAY_MS = 86_400_000
const VALID_LINK_KINDS = new Set<string>(['document', 'mail', 'event', 'web'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new AgentProjectsToolError(`"${key}" must be a string.`)
  }
  return value
}

function optionalTrimmed(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = optionalString(args, key)
  return value === undefined ? undefined : value.trim()
}

function optionalBoolean(
  args: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = args[key]
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') {
    throw new AgentProjectsToolError(`"${key}" must be a boolean.`)
  }
  return value
}

function optionalInt(
  args: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = args[key]
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AgentProjectsToolError(`"${key}" must be a number.`)
  }
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function optionalStringArray(
  args: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = args[key]
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new AgentProjectsToolError(`"${key}" must be an array of strings.`)
  }
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new AgentProjectsToolError(`Every entry in "${key}" must be a string.`)
    }
    const trimmed = item.trim()
    if (trimmed) out.push(trimmed)
  }
  return out
}

function optionalObjectArray(
  args: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] | undefined {
  const value = args[key]
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new AgentProjectsToolError(`"${key}" must be an array of objects.`)
  }
  for (const item of value) {
    if (!isRecord(item)) {
      throw new AgentProjectsToolError(`Every entry in "${key}" must be an object.`)
    }
  }
  return value as Record<string, unknown>[]
}

function parseReferenceDate(raw: string | undefined, fallback: Date): Date {
  if (!raw || !raw.trim()) return fallback
  const trimmed = raw.trim()
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T12:00:00.000Z`)
    : new Date(trimmed)
  if (!Number.isFinite(parsed.getTime())) {
    throw new AgentProjectsToolError(
      `Invalid asOfDate "${raw}". Expected YYYY-MM-DD or an ISO date string.`,
    )
  }
  return parsed
}

function daysSince(isoOrDate: string, reference: Date): number {
  if (!isoOrDate) return 0
  const parsed = new Date(isoOrDate)
  if (Number.isNaN(parsed.getTime())) return 0
  const startOfDay = (date: Date): number =>
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return Math.max(0, Math.round((startOfDay(reference) - startOfDay(parsed)) / DAY_MS))
}

function resolveTargetProject(
  store: ProjectsStore,
  ctx: ProjectsAgentToolContext,
  args: Record<string, unknown>,
): Project {
  const explicitId = optionalTrimmed(args, 'projectId')
  const projectId = explicitId || ctx.openProjectId()
  if (!projectId) {
    throw new AgentProjectsToolError(
      'projectId is required when no project is currently open.',
    )
  }
  const project = findProject(store, projectId)
  if (!project) {
    throw new AgentProjectsToolError(
      `No project "${projectId}" found — call listProjects for current ids.`,
    )
  }
  return project
}

function compactProject(project: Project, now: Date) {
  const done = completedCount(project)
  const total = project.deliverables.length
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    area: project.area || null,
    archived: isArchived(project),
    nextAction: project.nextAction || null,
    dueAt: project.dueAt || null,
    daysUntilDue: daysUntil(project.dueAt, now),
    overdue: isOverdue(project, now),
    people: project.people,
    waitingCount: project.waitingOn.length,
    deliverablesDone: done,
    deliverablesTotal: total,
    completionPct: total > 0 ? Math.round((done / total) * 100) : null,
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildStatusBriefHtml(
  project: Project,
  now: Date,
  extraHtml?: string,
): string {
  const today = now.toISOString().slice(0, 10)
  const openDeliverables = project.deliverables.filter(d => !d.doneAt)
  const doneDeliverables = project.deliverables.filter(d => !!d.doneAt)
  const parts: string[] = [
    `<h1>${escapeHtml(project.name)} — Status Brief</h1>`,
    `<p><strong>Date:</strong> ${escapeHtml(today)} | <strong>Status:</strong> ${escapeHtml(project.status)}${project.area ? ` | <strong>Area:</strong> ${escapeHtml(project.area)}` : ''}${project.dueAt ? ` | <strong>Due:</strong> ${escapeHtml(project.dueAt)}` : ''}</p>`,
  ]

  if (project.summary.trim()) {
    parts.push(`<h2>Overview</h2>`, `<p>${escapeHtml(project.summary.trim())}</p>`)
  }

  parts.push(
    `<h2>Next Action</h2>`,
    `<p>${project.nextAction.trim() ? escapeHtml(project.nextAction.trim()) : 'No next action set.'}</p>`,
  )

  if (project.waitingOn.length > 0) {
    parts.push(
      `<h2>Waiting On</h2>`,
      `<ul>${project.waitingOn
        .map(
          w =>
            `<li><strong>${escapeHtml(w.person)}</strong> — ${escapeHtml(w.what || 'unspecified')}${w.askedAt ? ` (asked ${escapeHtml(w.askedAt)})` : ''}</li>`,
        )
        .join('')}</ul>`,
    )
  }

  if (project.deliverables.length > 0) {
    parts.push(
      `<h2>Deliverables (${doneDeliverables.length}/${project.deliverables.length} complete)</h2>`,
    )
    if (openDeliverables.length > 0) {
      parts.push(
        `<ul>${openDeliverables
          .map(
            d =>
              `<li>[Open] ${escapeHtml(d.title)}${d.owner ? ` — ${escapeHtml(d.owner)}` : ''}${d.dueAt ? ` (due ${escapeHtml(d.dueAt)})` : ''}</li>`,
          )
          .join('')}</ul>`,
      )
    }
    if (doneDeliverables.length > 0) {
      parts.push(
        `<ul>${doneDeliverables
          .map(d => `<li>[Done] ${escapeHtml(d.title)}</li>`)
          .join('')}</ul>`,
      )
    }
  }

  if (project.journal.length > 0) {
    parts.push(
      `<h2>Recent Decisions</h2>`,
      `<ul>${project.journal
        .slice(0, 5)
        .map(
          entry =>
            `<li><strong>${escapeHtml(entry.at.slice(0, 10))} — ${escapeHtml(entry.title)}</strong>${entry.body ? `: ${escapeHtml(entry.body)}` : ''}</li>`,
        )
        .join('')}</ul>`,
    )
  }

  if (extraHtml && extraHtml.trim()) {
    parts.push(extraHtml.trim())
  }

  return parts.join('\n')
}

export const PUREPROJECTS_FUNCTIONS: readonly AppFunctionDefinition<ProjectsAgentToolContext>[] = [
  // ── 1. fn_portfolioBriefing ───────────────────────────────────────────────
  defineAppFunction<ProjectsAgentToolContext>({
    name: 'fn_portfolioBriefing',
    category: 'portfolio',
    risk: 'read',
    requiresApproval: false,
    replaces: ['getProjectsContext', 'listProjects', 'getProject'],
    description:
      'Generate a single-call executive portfolio briefing across PureProjects: currently open project, status totals, overdue and upcoming projects and deliverables, stalled waits sorted oldest-first and grouped by person, per-person workload, area breakdown, and a hygiene audit with health score. Filter optionally by area, status, person, or query.',
    inputSchema: {
      type: 'object',
      properties: {
        area: { type: 'string', description: 'Optional area filter (case-insensitive).' },
        status: {
          type: 'string',
          enum: ['idea', 'active', 'waiting', 'done'],
          description: 'Optional project status filter.',
        },
        person: {
          type: 'string',
          description: 'Optional person name filter (matches project people, deliverable owners, or waits).',
        },
        query: { type: 'string', description: 'Optional free-text search across projects.' },
        includeArchived: {
          type: 'boolean',
          description: 'Include archived projects alongside living ones (default false).',
        },
        horizonDays: {
          type: 'number',
          description: 'Days ahead for upcoming project and deliverable deadlines (default 7, range 1–90).',
        },
        staleWaitDays: {
          type: 'number',
          description: 'Days waiting before flagging a wait as stale (default 7, range 1–90).',
        },
        staleProjectDays: {
          type: 'number',
          description: 'Days without updates before flagging an active project as stale (default 14, range 1–180).',
        },
        asOfDate: {
          type: 'string',
          description: 'Optional YYYY-MM-DD or ISO reference date (defaults to today).',
        },
      },
    },
    run: async (ctx, args) => {
      const store = await ctx.refresh()
      const now = parseReferenceDate(optionalString(args, 'asOfDate'), ctx.now())
      const horizonDays = optionalInt(args, 'horizonDays', 7, 1, 90)
      const staleWaitDays = optionalInt(args, 'staleWaitDays', 7, 1, 90)
      const staleProjectDays = optionalInt(args, 'staleProjectDays', 14, 1, 180)
      const includeArchived = optionalBoolean(args, 'includeArchived') ?? false
      const areaFilter = optionalTrimmed(args, 'area')?.toLowerCase()
      const statusFilter = optionalTrimmed(args, 'status')
      if (statusFilter && !isProjectStatus(statusFilter)) {
        throw new AgentProjectsToolError(
          'status must be one of: idea, active, waiting, done.',
        )
      }
      const personFilter = optionalTrimmed(args, 'person')?.toLowerCase()
      const query = optionalString(args, 'query') ?? ''

      const living = livingProjects(store.projects)
      const archived = archivedProjects(store.projects)
      const pool = includeArchived ? store.projects : living

      const matched = sortForList(
        pool.filter(project => {
          if (statusFilter && project.status !== statusFilter) return false
          if (areaFilter && project.area.toLowerCase() !== areaFilter) return false
          if (query && !matchesQuery(project, query)) return false
          if (personFilter) {
            const involvesPerson =
              project.people.some(p => p.toLowerCase().includes(personFilter)) ||
              project.deliverables.some(d => d.owner.toLowerCase().includes(personFilter)) ||
              project.waitingOn.some(w => w.person.toLowerCase().includes(personFilter))
            if (!involvesPerson) return false
          }
          return true
        }),
        now,
      )

      const summary = summarize(matched, now)
      const openId = ctx.openProjectId()
      const openProj = openId ? living.find(p => p.id === openId) : undefined

      const overdueProjects = matched
        .filter(p => isOverdue(p, now))
        .map(p => compactProject(p, now))

      const dueSoonProjects = matched
        .filter(p => {
          if (p.status === 'done') return false
          const d = daysUntil(p.dueAt, now)
          return d !== null && d >= 0 && d <= horizonDays
        })
        .map(p => compactProject(p, now))

      const overdueDeliverables: Array<Record<string, unknown>> = []
      const upcomingDeliverables: Array<Record<string, unknown>> = []
      let totalOpenDeliverables = 0
      let totalLinkedDocuments = 0

      interface WaitItem {
        waitingId: string
        person: string
        what: string
        askedAt: string
        daysWaiting: number
        stale: boolean
        projectId: string
        projectName: string
      }
      const waitsOldestFirst: WaitItem[] = []

      const peopleMap = new Map<
        string,
        {
          person: string
          projectIds: Set<string>
          openDeliverables: number
          overdueDeliverables: number
          waitsOwed: number
        }
      >()
      const ensurePerson = (rawName: string) => {
        const display = rawName.trim() || 'you'
        const key = display.toLowerCase()
        let entry = peopleMap.get(key)
        if (!entry) {
          entry = {
            person: display,
            projectIds: new Set<string>(),
            openDeliverables: 0,
            overdueDeliverables: 0,
            waitsOwed: 0,
          }
          peopleMap.set(key, entry)
        }
        return entry
      }

      const areaMap = new Map<
        string,
        { area: string; total: number; active: number; waiting: number; overdue: number }
      >()

      const missingNextAction: Array<{ id: string; name: string; status: ProjectStatus }> = []
      const allDeliverablesDoneNotClosed: Array<{ id: string; name: string; status: ProjectStatus; deliverableCount: number }> = []
      const staleProjects: Array<{ id: string; name: string; status: ProjectStatus; daysSinceUpdate: number }> = []

      for (const project of matched) {
        totalLinkedDocuments += project.links.length

        const areaLabel = project.area.trim() || 'Unassigned'
        const areaKey = areaLabel.toLowerCase()
        const areaStats = areaMap.get(areaKey) ?? {
          area: areaLabel,
          total: 0,
          active: 0,
          waiting: 0,
          overdue: 0,
        }
        areaStats.total += 1
        if (project.status === 'active') areaStats.active += 1
        if (project.status === 'waiting') areaStats.waiting += 1
        if (isOverdue(project, now)) areaStats.overdue += 1
        areaMap.set(areaKey, areaStats)

        for (const p of project.people) {
          ensurePerson(p).projectIds.add(project.id)
        }

        for (const del of project.deliverables) {
          if (del.doneAt) continue
          totalOpenDeliverables += 1
          const ownerEntry = ensurePerson(del.owner || 'you')
          ownerEntry.projectIds.add(project.id)
          ownerEntry.openDeliverables += 1
          const d = daysUntil(del.dueAt, now)
          if (d !== null && d < 0) {
            ownerEntry.overdueDeliverables += 1
            overdueDeliverables.push({
              deliverableId: del.id,
              title: del.title,
              owner: del.owner || 'you',
              dueAt: del.dueAt,
              daysOverdue: Math.abs(d),
              projectId: project.id,
              projectName: project.name,
            })
          } else if (d !== null && d >= 0 && d <= horizonDays) {
            upcomingDeliverables.push({
              deliverableId: del.id,
              title: del.title,
              owner: del.owner || 'you',
              dueAt: del.dueAt,
              daysUntilDue: d,
              projectId: project.id,
              projectName: project.name,
            })
          }
        }

        for (const wait of project.waitingOn) {
          const daysWaiting = daysSince(wait.askedAt, now)
          const personEntry = ensurePerson(wait.person)
          personEntry.projectIds.add(project.id)
          personEntry.waitsOwed += 1
          waitsOldestFirst.push({
            waitingId: wait.id,
            person: wait.person,
            what: wait.what || 'unspecified',
            askedAt: wait.askedAt,
            daysWaiting,
            stale: daysWaiting >= staleWaitDays,
            projectId: project.id,
            projectName: project.name,
          })
        }

        if (hasNoNextAction(project)) {
          missingNextAction.push({
            id: project.id,
            name: project.name,
            status: project.status,
          })
        }

        if (
          project.status !== 'done' &&
          project.deliverables.length > 0 &&
          project.deliverables.every(d => !!d.doneAt)
        ) {
          allDeliverablesDoneNotClosed.push({
            id: project.id,
            name: project.name,
            status: project.status,
            deliverableCount: project.deliverables.length,
          })
        }

        if (project.status === 'active') {
          const age = daysSince(project.updatedAt, now)
          if (age >= staleProjectDays) {
            staleProjects.push({
              id: project.id,
              name: project.name,
              status: project.status,
              daysSinceUpdate: age,
            })
          }
        }
      }

      waitsOldestFirst.sort(
        (a, b) =>
          b.daysWaiting - a.daysWaiting || a.askedAt.localeCompare(b.askedAt),
      )
      overdueDeliverables.sort(
        (a, b) => (b.daysOverdue as number) - (a.daysOverdue as number),
      )
      upcomingDeliverables.sort(
        (a, b) => (a.daysUntilDue as number) - (b.daysUntilDue as number),
      )

      const waitsByPersonMap = new Map<
        string,
        { person: string; count: number; maxDaysWaiting: number; items: WaitItem[] }
      >()
      for (const wait of waitsOldestFirst) {
        const key = wait.person.toLowerCase()
        const group = waitsByPersonMap.get(key) ?? {
          person: wait.person,
          count: 0,
          maxDaysWaiting: 0,
          items: [],
        }
        group.count += 1
        group.maxDaysWaiting = Math.max(group.maxDaysWaiting, wait.daysWaiting)
        group.items.push(wait)
        waitsByPersonMap.set(key, group)
      }
      const waitsByPerson = [...waitsByPersonMap.values()].sort(
        (a, b) => b.maxDaysWaiting - a.maxDaysWaiting || b.count - a.count,
      )

      const staleWaits = waitsOldestFirst.filter(w => w.stale)
      const findings: Array<{ code: string; severity: 'high' | 'medium' | 'low'; count: number; message: string }> = []
      if (overdueProjects.length > 0) {
        findings.push({
          code: 'overdue-projects',
          severity: 'high',
          count: overdueProjects.length,
          message: `${overdueProjects.length} project(s) are past their due date.`,
        })
      }
      if (overdueDeliverables.length > 0) {
        findings.push({
          code: 'overdue-deliverables',
          severity: 'high',
          count: overdueDeliverables.length,
          message: `${overdueDeliverables.length} open deliverable(s) are overdue.`,
        })
      }
      if (missingNextAction.length > 0) {
        findings.push({
          code: 'missing-next-action',
          severity: 'medium',
          count: missingNextAction.length,
          message: `${missingNextAction.length} open project(s) have no next action defined.`,
        })
      }
      if (staleWaits.length > 0) {
        findings.push({
          code: 'stale-waits',
          severity: 'medium',
          count: staleWaits.length,
          message: `${staleWaits.length} wait(s) have been open for ${staleWaitDays}+ days.`,
        })
      }
      if (allDeliverablesDoneNotClosed.length > 0) {
        findings.push({
          code: 'ready-to-close',
          severity: 'low',
          count: allDeliverablesDoneNotClosed.length,
          message: `${allDeliverablesDoneNotClosed.length} project(s) have all deliverables done but are still open.`,
        })
      }
      if (staleProjects.length > 0) {
        findings.push({
          code: 'stale-projects',
          severity: 'low',
          count: staleProjects.length,
          message: `${staleProjects.length} active project(s) have not been updated in ${staleProjectDays}+ days.`,
        })
      }

      const penalty =
        overdueProjects.length * 12 +
        overdueDeliverables.length * 6 +
        missingNextAction.length * 8 +
        staleWaits.length * 6 +
        staleProjects.length * 4
      const healthScore = Math.max(0, Math.min(100, 100 - penalty))

      const peopleWorkload = [...peopleMap.values()]
        .map(entry => ({
          person: entry.person,
          projectsCount: entry.projectIds.size,
          openDeliverables: entry.openDeliverables,
          overdueDeliverables: entry.overdueDeliverables,
          waitsOwed: entry.waitsOwed,
        }))
        .sort(
          (a, b) =>
            b.overdueDeliverables - a.overdueDeliverables ||
            b.waitsOwed - a.waitsOwed ||
            b.openDeliverables - a.openDeliverables ||
            a.person.localeCompare(b.person),
        )

      const areas = [...areaMap.values()].sort((a, b) => b.total - a.total)

      return {
        mutated: false,
        summary: `Briefed ${matched.length} project(s): ${overdueProjects.length} overdue, ${waitsOldestFirst.length} open wait(s), ${missingNextAction.length} missing next action (health ${healthScore}/100).`,
        data: {
          asOfDate: now.toISOString().slice(0, 10),
          openProject: openProj ? compactProject(openProj, now) : null,
          totals: {
            ...summary,
            archivedTotal: archived.length,
            openDeliverables: totalOpenDeliverables,
            overdueDeliverables: overdueDeliverables.length,
            activeWaits: waitsOldestFirst.length,
            staleWaits: staleWaits.length,
            linkedResources: totalLinkedDocuments,
          },
          healthScore,
          findings,
          radar: {
            horizonDays,
            overdueProjects,
            dueSoonProjects,
            overdueDeliverables,
            upcomingDeliverables,
          },
          waits: {
            oldestFirst: waitsOldestFirst,
            byPerson: waitsByPerson,
          },
          hygiene: {
            missingNextAction,
            allDeliverablesDoneNotClosed,
            staleProjects,
          },
          peopleWorkload,
          areas,
          projects: matched.map(p => compactProject(p, now)),
        },
      }
    },
  }),

  // ── 2. fn_getProjectDossier ───────────────────────────────────────────────
  defineAppFunction<ProjectsAgentToolContext>({
    name: 'fn_getProjectDossier',
    category: 'projects',
    risk: 'read',
    requiresApproval: false,
    replaces: ['getProjectsContext', 'getProject', 'readDocument'],
    description:
      'Retrieve a complete operational dossier for one project (defaults to the currently open project when projectId is omitted): full metadata, categorized open/overdue/completed deliverables, next-action match, owner breakdown, aged waits, journal history, categorized links, and optional block previews of linked PureWriter documents.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Target project id. Omit to inspect the currently open project.',
        },
        includeDocumentPreviews: {
          type: 'boolean',
          description: 'Read linked .document packages and include leading block previews (default false).',
        },
        previewBlockLimit: {
          type: 'number',
          description: 'Maximum blocks per document preview when includeDocumentPreviews is true (default 5, range 1–30).',
        },
        journalLimit: {
          type: 'number',
          description: 'Maximum recent journal entries to include (default 25, range 1–100).',
        },
        asOfDate: {
          type: 'string',
          description: 'Optional YYYY-MM-DD or ISO reference date (defaults to today).',
        },
      },
    },
    run: async (ctx, args) => {
      const store = await ctx.refresh()
      const now = parseReferenceDate(optionalString(args, 'asOfDate'), ctx.now())
      const project = resolveTargetProject(store, ctx, args)
      const includeDocumentPreviews =
        optionalBoolean(args, 'includeDocumentPreviews') ?? false
      const previewBlockLimit = optionalInt(args, 'previewBlockLimit', 5, 1, 30)
      const journalLimit = optionalInt(args, 'journalLimit', 25, 1, 100)

      const nextDel = nextDeliverable(project)
      const mapDeliverable = (d: Deliverable) => {
        const due = daysUntil(d.dueAt, now)
        return {
          id: d.id,
          title: d.title,
          owner: d.owner || 'you',
          dueAt: d.dueAt || null,
          daysUntilDue: due,
          overdue: !d.doneAt && due !== null && due < 0,
          done: !!d.doneAt,
          doneAt: d.doneAt,
          isNextAction: nextDel?.id === d.id,
        }
      }

      const openDeliverables = project.deliverables
        .filter(d => !d.doneAt)
        .map(mapDeliverable)
      const overdueDeliverables = openDeliverables.filter(d => d.overdue)
      const completedDeliverables = project.deliverables
        .filter(d => !!d.doneAt)
        .map(mapDeliverable)

      const ownerCounts = new Map<string, { owner: string; open: number; done: number }>()
      for (const d of project.deliverables) {
        const owner = d.owner || 'you'
        const key = owner.toLowerCase()
        const entry = ownerCounts.get(key) ?? { owner, open: 0, done: 0 }
        if (d.doneAt) entry.done += 1
        else entry.open += 1
        ownerCounts.set(key, entry)
      }

      const waits = project.waitingOn.map(w => ({
        waitingId: w.id,
        person: w.person,
        what: w.what || 'unspecified',
        askedAt: w.askedAt,
        daysWaiting: daysSince(w.askedAt, now),
      }))

      const links = project.links.map(link => ({
        id: link.id,
        label: link.label,
        path: link.path,
        kind: link.kind,
        isDocumentPackage: isDocumentPackage(link.path),
      }))

      const linksByKind: Record<LinkKind, number> = {
        document: 0,
        mail: 0,
        event: 0,
        web: 0,
      }
      for (const link of project.links) {
        linksByKind[link.kind] = (linksByKind[link.kind] ?? 0) + 1
      }

      const documentPreviews: Array<Record<string, unknown>> = []
      if (includeDocumentPreviews) {
        const packageLinks = project.links.filter(l => isDocumentPackage(l.path))
        if (packageLinks.length > 0) {
          const extensions = await ctx.documentExtensions()
          for (const link of packageLinks) {
            try {
              const html = await ctx.readDocument(link.path)
              const blocks = readDocumentBlocks(extensions, html)
              documentPreviews.push({
                linkId: link.id,
                label: link.label,
                path: link.path,
                blockCount: blocks.length,
                previewBlocks: blocks.slice(0, previewBlockLimit),
              })
            } catch (error) {
              documentPreviews.push({
                linkId: link.id,
                label: link.label,
                path: link.path,
                error: error instanceof Error ? error.message : String(error),
              })
            }
          }
        }
      }

      return {
        mutated: false,
        summary: `Loaded dossier for "${project.name}" (${project.status}, ${completedDeliverables.length}/${project.deliverables.length} deliverables done, ${waits.length} wait(s), ${links.length} link(s)).`,
        data: {
          project: {
            ...compactProject(project, now),
            summary: project.summary || null,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            closedAt: project.closedAt,
            archivedAt: project.archivedAt,
            hasNoNextAction: hasNoNextAction(project),
          },
          nextActionDeliverable: nextDel ? mapDeliverable(nextDel) : null,
          deliverables: {
            open: openDeliverables,
            overdue: overdueDeliverables,
            completed: completedDeliverables,
            byOwner: [...ownerCounts.values()],
          },
          waitingOn: waits,
          journal: {
            total: project.journal.length,
            entries: project.journal.slice(0, journalLimit).map(e => ({
              id: e.id,
              at: e.at.slice(0, 10),
              title: e.title,
              body: e.body,
            })),
          },
          links: {
            total: links.length,
            byKind: linksByKind,
            items: links,
          },
          ...(includeDocumentPreviews ? { documentPreviews } : {}),
        },
      }
    },
  }),

  // ── 3. fn_kickoffProject ──────────────────────────────────────────────────
  defineAppFunction<ProjectsAgentToolContext>({
    name: 'fn_kickoffProject',
    category: 'projects',
    risk: 'write',
    requiresApproval: true,
    replaces: [
      'createProject',
      'addDeliverable',
      'setWaitingOn',
      'linkDocument',
      'logJournalEntry',
      'createDocument',
    ],
    description:
      'Create and scaffold a complete PureProjects project in one atomic call: sets project metadata, adds initial deliverables (optionally promoting the first as nextAction), records initial waits, links reference documents or web pages, appends a kickoff journal entry, and optionally creates a linked PureWriter document. Call getProjectsContext first.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name.' },
        summary: { type: 'string', description: 'Short description of the project goal.' },
        area: { type: 'string', description: 'Existing or new area grouping.' },
        status: {
          type: 'string',
          enum: ['idea', 'active'],
          description: 'Initial status (default "active"; becomes "waiting" automatically if waitingOn entries are given).',
        },
        nextAction: { type: 'string', description: 'Explicit first physical step.' },
        autoSetNextAction: {
          type: 'boolean',
          description: 'When nextAction is omitted and deliverables are supplied, set nextAction to the first deliverable title (default true).',
        },
        dueAt: { type: 'string', description: 'ISO project deadline.' },
        people: {
          type: 'array',
          items: { type: 'string' },
          description: 'People involved in the project.',
        },
        deliverables: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              owner: { type: 'string' },
              dueAt: { type: 'string' },
            },
            required: ['title'],
          },
          description: 'Initial deliverables/todos to create.',
        },
        waitingOn: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              person: { type: 'string' },
              what: { type: 'string' },
              askedAt: { type: 'string' },
            },
            required: ['person'],
          },
          description: 'Initial outstanding waits to record.',
        },
        links: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              path: {
                type: 'string',
                description: 'Workspace path or https:// URL.',
              },
              kind: { type: 'string', enum: ['document', 'mail', 'event', 'web'] },
            },
            required: ['label', 'path'],
          },
          description: 'Initial reference links to attach.',
        },
        journalEntry: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['title'],
          description: 'Optional kickoff decision/context entry for the journal.',
        },
        initialDocument: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            html: { type: 'string' },
          },
          required: ['title'],
          description: 'Optional PureWriter .document package to create and link.',
        },
      },
      required: ['name'],
    },
    run: async (ctx, args) => {
      const name = optionalTrimmed(args, 'name')
      if (!name) throw new AgentProjectsToolError('name is required.')

      const statusArg = optionalTrimmed(args, 'status')
      if (statusArg && statusArg !== 'idea' && statusArg !== 'active') {
        throw new AgentProjectsToolError(
          'status must be "idea" or "active" on kickoff (pass waitingOn to start in "waiting").',
        )
      }
      const initialStatus: ProjectStatus = (statusArg as ProjectStatus | undefined) ?? 'active'

      const deliverablesInput = optionalObjectArray(args, 'deliverables') ?? []
      const parsedDeliverables = deliverablesInput.map((item, idx) => {
        const title = optionalTrimmed(item, 'title')
        if (!title) {
          throw new AgentProjectsToolError(
            `deliverables[${idx}].title is required.`,
          )
        }
        return {
          title,
          owner: optionalString(item, 'owner')?.trim() ?? '',
          dueAt: optionalString(item, 'dueAt')?.trim() ?? '',
        }
      })

      const waitsInput = optionalObjectArray(args, 'waitingOn') ?? []
      const nowDate = ctx.now()
      const nowIso = nowDate.toISOString()
      const todayIso = nowIso.slice(0, 10)
      const parsedWaits = waitsInput.map((item, idx) => {
        const person = optionalTrimmed(item, 'person')
        if (!person) {
          throw new AgentProjectsToolError(
            `waitingOn[${idx}].person is required.`,
          )
        }
        return {
          person,
          what: optionalString(item, 'what')?.trim() ?? '',
          askedAt: optionalString(item, 'askedAt')?.trim() || todayIso,
        }
      })

      const linksInput = optionalObjectArray(args, 'links') ?? []
      const parsedLinks = linksInput.map((item, idx) => {
        const label = optionalTrimmed(item, 'label')
        const path = optionalTrimmed(item, 'path')
        const kind = optionalTrimmed(item, 'kind')
        if (!label) throw new AgentProjectsToolError(`links[${idx}].label is required.`)
        if (!path) throw new AgentProjectsToolError(`links[${idx}].path is required.`)
        if (kind && !VALID_LINK_KINDS.has(kind)) {
          throw new AgentProjectsToolError(
            `links[${idx}].kind must be one of: document, mail, event, web.`,
          )
        }
        return {
          label,
          path,
          kind: /^https?:\/\//i.test(path)
            ? ('web' as LinkKind)
            : (kind as LinkKind | undefined),
        }
      })

      let parsedJournal: { title: string; body: string } | undefined
      if (args.journalEntry !== undefined) {
        if (!isRecord(args.journalEntry)) {
          throw new AgentProjectsToolError('journalEntry must be an object.')
        }
        const jTitle = optionalTrimmed(args.journalEntry, 'title')
        if (!jTitle) {
          throw new AgentProjectsToolError('journalEntry.title is required.')
        }
        parsedJournal = {
          title: jTitle,
          body: optionalString(args.journalEntry, 'body') ?? '',
        }
      }

      let parsedDoc: { title: string; html?: string } | undefined
      if (args.initialDocument !== undefined) {
        if (!isRecord(args.initialDocument)) {
          throw new AgentProjectsToolError('initialDocument must be an object.')
        }
        const dTitle = optionalTrimmed(args.initialDocument, 'title')
        if (!dTitle) {
          throw new AgentProjectsToolError('initialDocument.title is required.')
        }
        parsedDoc = {
          title: dTitle,
          html: optionalString(args.initialDocument, 'html'),
        }
      }

      const explicitNextAction = optionalString(args, 'nextAction')?.trim() ?? ''
      const autoSetNextAction = optionalBoolean(args, 'autoSetNextAction') ?? true
      const resolvedNextAction =
        explicitNextAction ||
        (autoSetNextAction && parsedDeliverables.length > 0
          ? parsedDeliverables[0]!.title
          : '')

      let project = createProject(
        {
          name,
          summary: optionalString(args, 'summary') ?? '',
          area: optionalString(args, 'area') ?? '',
          status: initialStatus,
          nextAction: resolvedNextAction,
          dueAt: optionalString(args, 'dueAt') ?? '',
          people: optionalStringArray(args, 'people') ?? [],
        },
        nowIso,
      )

      for (const del of parsedDeliverables) {
        project = addDeliverable(project, del, nowIso)
      }
      for (const wait of parsedWaits) {
        project = addWaitingOn(project, wait, nowIso)
      }
      for (const link of parsedLinks) {
        project = linkDocument(project, link, nowIso)
      }
      if (parsedJournal) {
        project = logJournalEntry(project, parsedJournal, nowIso)
      }

      await ctx.mutate(store => ({
        ...store,
        projects: [...store.projects, project],
      }))

      let createdDocument: { path: string; name: string } | null = null
      if (parsedDoc) {
        createdDocument = await ctx.createDocument({
          projectId: project.id,
          title: parsedDoc.title,
          html: parsedDoc.html,
        })
      }

      ctx.focusProject(project.id)

      return {
        mutated: true,
        summary: `Kicked off project "${project.name}" with ${project.deliverables.length} deliverable(s), ${project.waitingOn.length} wait(s), ${project.links.length} link(s)${createdDocument ? ', and 1 new document' : ''}.`,
        data: {
          project: compactProject(project, nowDate),
          deliverablesCreated: project.deliverables.map(d => ({
            id: d.id,
            title: d.title,
            owner: d.owner || 'you',
            dueAt: d.dueAt || null,
          })),
          waitsCreated: project.waitingOn.map(w => ({
            waitingId: w.id,
            person: w.person,
            what: w.what || 'unspecified',
            askedAt: w.askedAt,
          })),
          linksCreated: project.links.length,
          journalLogged: Boolean(parsedJournal),
          createdDocument,
        },
      }
    },
  }),

  // ── 4. fn_updateProjectProgress ───────────────────────────────────────────
  defineAppFunction<ProjectsAgentToolContext>({
    name: 'fn_updateProjectProgress',
    category: 'deliverables',
    risk: 'write',
    requiresApproval: true,
    replaces: [
      'addDeliverable',
      'updateDeliverable',
      'setWaitingOn',
      'updateProject',
      'logJournalEntry',
    ],
    description:
      'Apply a coordinated check-in to one project in a single atomic transaction (defaults to the currently open project): add and update deliverables, resolve or stack waits, promote a deliverable to nextAction or update project fields, and log a journal entry. Supports dryRun preview without mutating.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Target project id. Omit to target the currently open project.',
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview changes without saving (default false).',
        },
        addDeliverables: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              owner: { type: 'string' },
              dueAt: { type: 'string' },
            },
            required: ['title'],
          },
        },
        updateDeliverables: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              deliverableId: { type: 'string' },
              title: { type: 'string' },
              owner: { type: 'string' },
              dueAt: { type: 'string' },
              done: { type: 'boolean' },
            },
            required: ['deliverableId'],
          },
        },
        promoteDeliverableId: {
          type: 'string',
          description: 'Open deliverable id to promote as the project nextAction.',
        },
        resolveWaitingIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific waitingIds that arrived and should be cleared.',
        },
        clearAllWaits: {
          type: 'boolean',
          description: 'Clear every outstanding wait on the project.',
        },
        addWaits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              person: { type: 'string' },
              what: { type: 'string' },
              askedAt: { type: 'string' },
            },
            required: ['person'],
          },
          description: 'New waits to stack onto the project.',
        },
        nextAction: { type: 'string' },
        status: {
          type: 'string',
          enum: ['idea', 'active', 'done'],
          description: 'Set status explicitly (use addWaits for "waiting").',
        },
        dueAt: {
          type: 'string',
          description: 'ISO due date, or empty string to clear.',
        },
        area: { type: 'string' },
        summary: { type: 'string' },
        people: { type: 'array', items: { type: 'string' } },
        journalEntry: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['title'],
        },
      },
    },
    run: async (ctx, args) => {
      const store = await ctx.refresh()
      const project = resolveTargetProject(store, ctx, args)
      const dryRun = optionalBoolean(args, 'dryRun') ?? false
      const nowDate = ctx.now()
      const nowIso = nowDate.toISOString()
      const todayIso = nowIso.slice(0, 10)

      const addDelsRaw = optionalObjectArray(args, 'addDeliverables') ?? []
      const addDels = addDelsRaw.map((item, idx) => {
        const title = optionalTrimmed(item, 'title')
        if (!title) {
          throw new AgentProjectsToolError(`addDeliverables[${idx}].title is required.`)
        }
        return {
          title,
          owner: optionalString(item, 'owner')?.trim() ?? '',
          dueAt: optionalString(item, 'dueAt')?.trim() ?? '',
        }
      })

      const updateDelsRaw = optionalObjectArray(args, 'updateDeliverables') ?? []
      const updateDels = updateDelsRaw.map((item, idx) => {
        const deliverableId = optionalTrimmed(item, 'deliverableId')
        if (!deliverableId) {
          throw new AgentProjectsToolError(
            `updateDeliverables[${idx}].deliverableId is required.`,
          )
        }
        if (!project.deliverables.some(d => d.id === deliverableId)) {
          throw new AgentProjectsToolError(
            `No deliverable "${deliverableId}" on "${project.name}" — call getProject for current ids.`,
          )
        }
        return {
          deliverableId,
          title: optionalString(item, 'title'),
          owner: optionalString(item, 'owner'),
          dueAt: optionalString(item, 'dueAt'),
          done: optionalBoolean(item, 'done'),
        }
      })

      const resolveWaitingIds = optionalStringArray(args, 'resolveWaitingIds') ?? []
      for (const wid of resolveWaitingIds) {
        if (!project.waitingOn.some(w => w.id === wid)) {
          throw new AgentProjectsToolError(
            `No waitingId "${wid}" on "${project.name}" — call getProject for current waits.`,
          )
        }
      }
      const clearAllWaits = optionalBoolean(args, 'clearAllWaits') ?? false

      const addWaitsRaw = optionalObjectArray(args, 'addWaits') ?? []
      const addWaits = addWaitsRaw.map((item, idx) => {
        const person = optionalTrimmed(item, 'person')
        if (!person) {
          throw new AgentProjectsToolError(`addWaits[${idx}].person is required.`)
        }
        return {
          person,
          what: optionalString(item, 'what')?.trim() ?? '',
          askedAt: optionalString(item, 'askedAt')?.trim() || todayIso,
        }
      })

      const statusArg = optionalTrimmed(args, 'status')
      if (statusArg === 'waiting') {
        throw new AgentProjectsToolError(
          'Use addWaits to move a project into "waiting" with who and what is owed.',
        )
      }
      if (statusArg && !isProjectStatus(statusArg)) {
        throw new AgentProjectsToolError(
          'status must be one of: idea, active, done.',
        )
      }
      const nextStatus = statusArg as Exclude<ProjectStatus, 'waiting'> | undefined

      const nextAction = optionalString(args, 'nextAction')
      const dueAt = 'dueAt' in args ? (optionalString(args, 'dueAt') ?? '') : undefined
      const area = optionalString(args, 'area')
      const summary = optionalString(args, 'summary')
      const people = optionalStringArray(args, 'people')
      const promoteDeliverableId = optionalTrimmed(args, 'promoteDeliverableId')

      let parsedJournal: { title: string; body: string } | undefined
      if (args.journalEntry !== undefined) {
        if (!isRecord(args.journalEntry)) {
          throw new AgentProjectsToolError('journalEntry must be an object.')
        }
        const jTitle = optionalTrimmed(args.journalEntry, 'title')
        if (!jTitle) {
          throw new AgentProjectsToolError('journalEntry.title is required.')
        }
        parsedJournal = {
          title: jTitle,
          body: optionalString(args.journalEntry, 'body') ?? '',
        }
      }

      const applyChanges = (current: Project): Project => {
        let next = current
        for (const del of addDels) {
          next = addDeliverable(next, del, nowIso)
        }
        for (const upd of updateDels) {
          next = updateDeliverable(
            next,
            upd.deliverableId,
            {
              title: upd.title,
              owner: upd.owner,
              dueAt: upd.dueAt,
              done: upd.done,
            },
            nowIso,
          )
        }
        if (clearAllWaits) {
          next = resolveWaitingOn(next, null, nowIso)
        } else {
          for (const wid of resolveWaitingIds) {
            next = resolveWaitingOn(next, wid, nowIso)
          }
        }
        for (const wait of addWaits) {
          next = addWaitingOn(next, wait, nowIso)
        }
        if (
          nextAction !== undefined ||
          dueAt !== undefined ||
          area !== undefined ||
          summary !== undefined ||
          people !== undefined ||
          nextStatus !== undefined
        ) {
          next = touch(
            {
              ...next,
              ...(nextAction !== undefined ? { nextAction } : {}),
              ...(dueAt !== undefined ? { dueAt } : {}),
              ...(area !== undefined ? { area } : {}),
              ...(summary !== undefined ? { summary } : {}),
              ...(people !== undefined ? { people } : {}),
              ...(nextStatus
                ? {
                    status: nextStatus,
                    closedAt: nextStatus === 'done' ? nowIso : null,
                    ...(nextStatus === 'done' ? { waitingOn: [] } : {}),
                  }
                : {}),
            },
            nowIso,
          )
        }
        if (promoteDeliverableId) {
          const candidate = next.deliverables.find(d => d.id === promoteDeliverableId)
          if (!candidate) {
            throw new AgentProjectsToolError(
              `Cannot promote unknown deliverable "${promoteDeliverableId}".`,
            )
          }
          if (candidate.doneAt) {
            throw new AgentProjectsToolError(
              `Cannot promote completed deliverable "${candidate.title}" as nextAction.`,
            )
          }
          next = setNextActionFromDeliverable(next, promoteDeliverableId, nowIso)
        }
        if (parsedJournal) {
          next = logJournalEntry(next, parsedJournal, nowIso)
        }
        return next
      }

      // Run transformation once up front to validate promoteDeliverableId and build preview.
      const preview = applyChanges(project)
      const changedFields: string[] = []
      if (addDels.length > 0) changedFields.push('addDeliverables')
      if (updateDels.length > 0) changedFields.push('updateDeliverables')
      if (clearAllWaits || resolveWaitingIds.length > 0) changedFields.push('resolveWaits')
      if (addWaits.length > 0) changedFields.push('addWaits')
      if (preview.nextAction !== project.nextAction) changedFields.push('nextAction')
      if (preview.status !== project.status) changedFields.push('status')
      if (preview.dueAt !== project.dueAt) changedFields.push('dueAt')
      if (preview.area !== project.area) changedFields.push('area')
      if (preview.summary !== project.summary) changedFields.push('summary')
      if (people !== undefined) changedFields.push('people')
      if (parsedJournal) changedFields.push('journalEntry')

      let finalProject = preview
      if (!dryRun) {
        const saved = await ctx.mutate(currentStore => {
          const live = findProject(currentStore, project.id)
          if (!live) {
            throw new AgentProjectsToolError(
              `Project "${project.id}" no longer exists.`,
            )
          }
          return {
            ...currentStore,
            projects: currentStore.projects.map(p =>
              p.id === project.id ? applyChanges(p) : p,
            ),
          }
        })
        finalProject = findProject(saved, project.id) ?? preview
        ctx.focusProject(project.id)
      }

      return {
        mutated: !dryRun && changedFields.length > 0,
        summary: dryRun
          ? `Dry run for "${project.name}": would apply ${changedFields.length} change group(s) (${changedFields.join(', ') || 'none'}).`
          : `Updated "${finalProject.name}": ${addDels.length} deliverable(s) added, ${updateDels.length} updated, ${clearAllWaits ? project.waitingOn.length : resolveWaitingIds.length} wait(s) resolved, ${addWaits.length} wait(s) added.`,
        data: {
          dryRun,
          changedFields,
          deliverablesAdded: addDels.length,
          deliverablesUpdated: updateDels.length,
          waitsResolved: clearAllWaits
            ? project.waitingOn.length
            : resolveWaitingIds.length,
          waitsAdded: addWaits.length,
          journalLogged: Boolean(parsedJournal),
          project: compactProject(finalProject, nowDate),
        },
      }
    },
  }),

  // ── 5. fn_batchRebalanceProjects ──────────────────────────────────────────
  defineAppFunction<ProjectsAgentToolContext>({
    name: 'fn_batchRebalanceProjects',
    category: 'portfolio',
    risk: 'write',
    requiresApproval: true,
    replaces: ['updateProject', 'moveDeliverable', 'archiveProject', 'logJournalEntry'],
    description:
      'Execute a validated multi-project review and rebalancing batch in one atomic mutation: update fields, add or remove people, archive or restore projects, append journal entries across multiple projects, and move deliverables between projects. Supports dryRun preview without persisting.',
    inputSchema: {
      type: 'object',
      properties: {
        dryRun: {
          type: 'boolean',
          description: 'Preview every change without writing to the store (default false).',
        },
        projectUpdates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              area: { type: 'string' },
              dueAt: { type: 'string' },
              nextAction: { type: 'string' },
              status: { type: 'string', enum: ['idea', 'active', 'done'] },
              addPeople: { type: 'array', items: { type: 'string' } },
              removePeople: { type: 'array', items: { type: 'string' } },
              archive: {
                type: 'boolean',
                description: 'true to archive, false to restore into view.',
              },
              journalEntry: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  body: { type: 'string' },
                },
                required: ['title'],
              },
            },
            required: ['projectId'],
          },
        },
        deliverableMoves: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fromProjectId: { type: 'string' },
              deliverableId: { type: 'string' },
              toProjectId: { type: 'string' },
            },
            required: ['fromProjectId', 'deliverableId', 'toProjectId'],
          },
        },
      },
    },
    run: async (ctx, args) => {
      const dryRun = optionalBoolean(args, 'dryRun') ?? false
      const updatesRaw = optionalObjectArray(args, 'projectUpdates') ?? []
      const movesRaw = optionalObjectArray(args, 'deliverableMoves') ?? []
      if (updatesRaw.length === 0 && movesRaw.length === 0) {
        throw new AgentProjectsToolError(
          'Provide at least one entry in projectUpdates or deliverableMoves.',
        )
      }

      const store = await ctx.refresh()
      const nowDate = ctx.now()
      const nowIso = nowDate.toISOString()

      interface ParsedUpdate {
        projectId: string
        area?: string
        dueAt?: string
        nextAction?: string
        status?: Exclude<ProjectStatus, 'waiting'>
        addPeople?: string[]
        removePeople?: string[]
        archive?: boolean
        journalEntry?: { title: string; body: string }
      }

      const parsedUpdates: ParsedUpdate[] = updatesRaw.map((item, idx) => {
        const projectId = optionalTrimmed(item, 'projectId')
        if (!projectId) {
          throw new AgentProjectsToolError(
            `projectUpdates[${idx}].projectId is required.`,
          )
        }
        if (!findProject(store, projectId)) {
          throw new AgentProjectsToolError(
            `projectUpdates[${idx}]: no project "${projectId}" — call listProjects for current ids.`,
          )
        }
        const statusArg = optionalTrimmed(item, 'status')
        if (statusArg === 'waiting') {
          throw new AgentProjectsToolError(
            `projectUpdates[${idx}]: cannot set status to "waiting" without naming who/what; use fn_updateProjectProgress or setWaitingOn.`,
          )
        }
        if (statusArg && !isProjectStatus(statusArg)) {
          throw new AgentProjectsToolError(
            `projectUpdates[${idx}].status must be idea, active, or done.`,
          )
        }
        let journalEntry: { title: string; body: string } | undefined
        if (item.journalEntry !== undefined) {
          if (!isRecord(item.journalEntry)) {
            throw new AgentProjectsToolError(
              `projectUpdates[${idx}].journalEntry must be an object.`,
            )
          }
          const title = optionalTrimmed(item.journalEntry, 'title')
          if (!title) {
            throw new AgentProjectsToolError(
              `projectUpdates[${idx}].journalEntry.title is required.`,
            )
          }
          journalEntry = {
            title,
            body: optionalString(item.journalEntry, 'body') ?? '',
          }
        }
        return {
          projectId,
          area: optionalString(item, 'area'),
          dueAt: 'dueAt' in item ? (optionalString(item, 'dueAt') ?? '') : undefined,
          nextAction: optionalString(item, 'nextAction'),
          status: statusArg as Exclude<ProjectStatus, 'waiting'> | undefined,
          addPeople: optionalStringArray(item, 'addPeople'),
          removePeople: optionalStringArray(item, 'removePeople'),
          archive: optionalBoolean(item, 'archive'),
          journalEntry,
        }
      })

      interface ParsedMove {
        fromProjectId: string
        deliverableId: string
        toProjectId: string
        title: string
      }

      const parsedMoves: ParsedMove[] = movesRaw.map((item, idx) => {
        const fromProjectId = optionalTrimmed(item, 'fromProjectId')
        const deliverableId = optionalTrimmed(item, 'deliverableId')
        const toProjectId = optionalTrimmed(item, 'toProjectId')
        if (!fromProjectId || !deliverableId || !toProjectId) {
          throw new AgentProjectsToolError(
            `deliverableMoves[${idx}] requires fromProjectId, deliverableId, and toProjectId.`,
          )
        }
        if (fromProjectId === toProjectId) {
          throw new AgentProjectsToolError(
            `deliverableMoves[${idx}]: fromProjectId and toProjectId must differ.`,
          )
        }
        const from = findProject(store, fromProjectId)
        const to = findProject(store, toProjectId)
        if (!from) {
          throw new AgentProjectsToolError(
            `deliverableMoves[${idx}]: no source project "${fromProjectId}".`,
          )
        }
        if (!to) {
          throw new AgentProjectsToolError(
            `deliverableMoves[${idx}]: no destination project "${toProjectId}".`,
          )
        }
        const del = from.deliverables.find(d => d.id === deliverableId)
        if (!del) {
          throw new AgentProjectsToolError(
            `deliverableMoves[${idx}]: no deliverable "${deliverableId}" on "${from.name}".`,
          )
        }
        return { fromProjectId, deliverableId, toProjectId, title: del.title }
      })

      const applyBatch = (currentStore: ProjectsStore): ProjectsStore => {
        let nextStore = currentStore
        for (const upd of parsedUpdates) {
          nextStore = {
            ...nextStore,
            projects: nextStore.projects.map(project => {
              if (project.id !== upd.projectId) return project
              let next = project
              let nextPeople = next.people
              if (upd.addPeople?.length) {
                const seen = new Set(nextPeople.map(p => p.toLowerCase()))
                const additions = upd.addPeople.filter(p => !seen.has(p.toLowerCase()))
                nextPeople = [...nextPeople, ...additions]
              }
              if (upd.removePeople?.length) {
                const drop = new Set(upd.removePeople.map(p => p.toLowerCase()))
                nextPeople = nextPeople.filter(p => !drop.has(p.toLowerCase()))
              }
              if (
                upd.area !== undefined ||
                upd.dueAt !== undefined ||
                upd.nextAction !== undefined ||
                upd.status !== undefined ||
                nextPeople !== next.people
              ) {
                next = touch(
                  {
                    ...next,
                    ...(upd.area !== undefined ? { area: upd.area } : {}),
                    ...(upd.dueAt !== undefined ? { dueAt: upd.dueAt } : {}),
                    ...(upd.nextAction !== undefined ? { nextAction: upd.nextAction } : {}),
                    people: nextPeople,
                    ...(upd.status
                      ? {
                          status: upd.status,
                          closedAt: upd.status === 'done' ? nowIso : null,
                          ...(upd.status === 'done' ? { waitingOn: [] } : {}),
                        }
                      : {}),
                  },
                  nowIso,
                )
              }
              if (upd.archive === true) next = archiveProject(next, nowIso)
              else if (upd.archive === false) next = restoreProject(next, nowIso)
              if (upd.journalEntry) {
                next = logJournalEntry(next, upd.journalEntry, nowIso)
              }
              return next
            }),
          }
        }
        for (const move of parsedMoves) {
          nextStore = moveDeliverable(
            nextStore,
            {
              fromProjectId: move.fromProjectId,
              deliverableId: move.deliverableId,
              toProjectId: move.toProjectId,
            },
            nowIso,
          )
        }
        return nextStore
      }

      const resultingStore = dryRun
        ? applyBatch(store)
        : await ctx.mutate(applyBatch)

      const touchedIds = [
        ...new Set([
          ...parsedUpdates.map(u => u.projectId),
          ...parsedMoves.flatMap(m => [m.fromProjectId, m.toProjectId]),
        ]),
      ]
      const updatedProjects = touchedIds
        .map(id => findProject(resultingStore, id))
        .filter((p): p is Project => Boolean(p))
        .map(p => compactProject(p, nowDate))

      return {
        mutated: !dryRun,
        summary: dryRun
          ? `Dry run: would apply ${parsedUpdates.length} project update(s) and ${parsedMoves.length} deliverable move(s).`
          : `Rebalanced ${parsedUpdates.length} project update(s) and moved ${parsedMoves.length} deliverable(s).`,
        data: {
          dryRun,
          projectUpdatesApplied: parsedUpdates.length,
          deliverableMovesApplied: parsedMoves.length,
          moves: parsedMoves,
          affectedProjects: updatedProjects,
        },
      }
    },
  }),

  // ── 6. fn_prepareHandoverPackage ──────────────────────────────────────────
  defineAppFunction<ProjectsAgentToolContext>({
    name: 'fn_prepareHandoverPackage',
    category: 'documents',
    risk: 'write',
    requiresApproval: true,
    replaces: [
      'getProject',
      'createDocument',
      'exportDocumentsPdf',
      'exportProjectZip',
      'logJournalEntry',
    ],
    description:
      'Assemble a project handover package in one call (defaults to the currently open project): optionally generate and link a PureWriter status-brief document summarizing deliverables, waits, and decisions, export the project documents as PDFs and/or a ZIP archive, and optionally log the handover in the project journal. Call getProjectsContext first.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Target project id. Omit to use the currently open project.',
        },
        format: {
          type: 'string',
          enum: ['zip', 'pdf', 'both'],
          description: 'Export output format (default "zip").',
        },
        includeStatusBrief: {
          type: 'boolean',
          description: 'Generate and link a fresh PureWriter status-brief .document before exporting (default false).',
        },
        briefTitle: {
          type: 'string',
          description: 'Optional custom title for the generated status brief.',
        },
        extraBriefHtml: {
          type: 'string',
          description: 'Optional extra HTML section appended to the generated status brief.',
        },
        documentPaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional subset of linked document paths to export. Omit to export every document on the project.',
        },
        logHandoverInJournal: {
          type: 'boolean',
          description: 'Append a journal entry recording the handover bundle (default false).',
        },
        journalNote: {
          type: 'string',
          description: 'Optional custom note included in the handover journal entry.',
        },
      },
    },
    run: async (ctx, args) => {
      const initialStore = await ctx.refresh()
      let project = resolveTargetProject(initialStore, ctx, args)
      const nowDate = ctx.now()
      const nowIso = nowDate.toISOString()

      const formatArg = optionalTrimmed(args, 'format') ?? 'zip'
      if (formatArg !== 'zip' && formatArg !== 'pdf' && formatArg !== 'both') {
        throw new AgentProjectsToolError('format must be "zip", "pdf", or "both".')
      }
      const includeStatusBrief = optionalBoolean(args, 'includeStatusBrief') ?? false
      const briefTitle = optionalTrimmed(args, 'briefTitle')
      const extraBriefHtml = optionalString(args, 'extraBriefHtml')
      const requestedPaths = optionalStringArray(args, 'documentPaths')
      const logHandoverInJournal = optionalBoolean(args, 'logHandoverInJournal') ?? false
      const journalNote = optionalTrimmed(args, 'journalNote')

      let statusBrief: { path: string; name: string } | null = null
      if (includeStatusBrief) {
        const html = buildStatusBriefHtml(project, nowDate, extraBriefHtml)
        statusBrief = await ctx.createDocument({
          projectId: project.id,
          title: briefTitle || `${project.name} — Status Brief`,
          html,
        })
        const refreshed = await ctx.refresh()
        project = findProject(refreshed, project.id) ?? project
      }

      const allExportable = exportableDocuments(project.links).map(
        item => item.packagePath,
      )
      if (statusBrief && !allExportable.includes(statusBrief.path)) {
        allExportable.push(statusBrief.path)
      }

      const selectedPaths =
        requestedPaths && requestedPaths.length > 0
          ? allExportable.filter(
              p =>
                requestedPaths.includes(p) ||
                (statusBrief !== null && p === statusBrief.path),
            )
          : allExportable

      if (selectedPaths.length === 0) {
        throw new AgentProjectsToolError(
          `"${project.name}" has no exportable documents — pass includeStatusBrief: true or create/link a document first.`,
        )
      }

      let writtenPdfs: string[] = []
      let skippedAttachedFiles = 0
      let zipPath: string | null = null
      const artifactPaths: string[] = []

      if (formatArg === 'pdf' || formatArg === 'both') {
        const pdfResult = await ctx.exportDocumentsPdf(project.id, selectedPaths)
        writtenPdfs = pdfResult.written
        skippedAttachedFiles = pdfResult.skipped
        artifactPaths.push(...writtenPdfs)
      }

      if (formatArg === 'zip' || formatArg === 'both') {
        zipPath = await ctx.exportProjectZip(project.id, selectedPaths)
        artifactPaths.push(zipPath)
      }

      if (logHandoverInJournal) {
        const summaryParts: string[] = []
        if (statusBrief) summaryParts.push(`Created status brief "${statusBrief.name}".`)
        if (zipPath) summaryParts.push(`Bundled ${selectedPaths.length} document(s) to ${zipPath}.`)
        if (writtenPdfs.length > 0) summaryParts.push(`Exported ${writtenPdfs.length} PDF(s).`)
        if (journalNote) summaryParts.push(journalNote)
        await ctx.mutate(store => ({
          ...store,
          projects: store.projects.map(p =>
            p.id === project.id
              ? logJournalEntry(
                  p,
                  {
                    title: `Prepared handover package (${formatArg})`,
                    body: summaryParts.join(' '),
                  },
                  nowIso,
                )
              : p,
          ),
        }))
      }

      ctx.focusProject(project.id)

      return {
        mutated: true,
        summary: `Prepared ${formatArg} handover package for "${project.name}" (${selectedPaths.length} document(s), ${artifactPaths.length} artifact(s)).`,
        data: {
          project: { id: project.id, name: project.name },
          format: formatArg,
          includedDocuments: selectedPaths.length,
          statusBrief,
          writtenPdfs,
          skippedAttachedFiles,
          zipPath,
          artifactPaths,
          journalLogged: logHandoverInJournal,
        },
      }
    },
  }),
] as const
