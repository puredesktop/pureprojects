import { PROJECTS_STORE_VERSION } from '../constants'
import type {
  Deliverable,
  JournalEntry,
  Project,
  ProjectLink,
  ProjectStatus,
  ProjectsStore,
  WaitingOn,
} from '../types'

export function emptyStore(): ProjectsStore {
  return { storeVersion: PROJECTS_STORE_VERSION, projects: [] }
}

/**
 * Parse a persisted store defensively. Missing fields are defaulted and
 * unknown ones preserved on the project object is NOT attempted — the
 * shape is owned here — but a malformed project is dropped rather than
 * crashing the app on boot, and everything else still loads.
 */
export function parseStore(value: unknown): ProjectsStore {
  if (!value || typeof value !== 'object') return emptyStore()
  const raw = value as Partial<ProjectsStore>
  if (!Array.isArray(raw.projects)) return emptyStore()
  const projects = raw.projects
    .filter(
      (project): project is Project =>
        !!project &&
        typeof project === 'object' &&
        typeof (project as Project).id === 'string' &&
        typeof (project as Project).name === 'string',
    )
    .map(normalizeProject)
  return { storeVersion: PROJECTS_STORE_VERSION, projects }
}

function normalizeProject(project: Project): Project {
  return {
    ...project,
    summary: project.summary ?? '',
    area: project.area ?? '',
    status: isProjectStatus(project.status) ? project.status : 'active',
    nextAction: project.nextAction ?? '',
    dueAt: project.dueAt ?? '',
    people: Array.isArray(project.people) ? project.people : [],
    waitingOn: normalizeWaitingOn(project),
    deliverables: Array.isArray(project.deliverables) ? project.deliverables : [],
    journal: Array.isArray(project.journal) ? project.journal : [],
    links: Array.isArray(project.links) ? project.links : [],
    closedAt: project.closedAt ?? null,
    archivedAt: project.archivedAt ?? null,
    order: typeof project.order === 'number' ? project.order : null,
  }
}

/**
 * Stores written before waits could stack hold a single object (or null).
 * Read both shapes; a legacy entry keeps its asked date and gets an id so
 * it can be resolved individually like any other.
 */
function normalizeWaitingOn(project: Project): WaitingOn[] {
  const raw = (project as { waitingOn?: unknown }).waitingOn
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list
    .filter(
      (item): item is Partial<WaitingOn> =>
        !!item && typeof item === 'object' && typeof (item as WaitingOn).person === 'string',
    )
    .filter(item => (item.person ?? '').trim().length > 0)
    .map((item, index) => ({
      id:
        typeof item.id === 'string' && item.id
          ? item.id
          : `wait_legacy_${index}_${(item.askedAt ?? '').slice(0, 10)}`,
      person: item.person!.trim(),
      what: (item.what ?? '').trim(),
      askedAt: item.askedAt ?? '',
    }))
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return value === 'idea' || value === 'active' || value === 'waiting' || value === 'done'
}

let idCounter = 0
/** Ids are stable strings; the counter only breaks ties inside one ms. */
export function makeId(prefix: string, now: string): string {
  idCounter += 1
  return `${prefix}_${now.replace(/[^0-9]/g, '')}_${idCounter}`
}

export function createProject(
  input: Partial<Project> & { name: string },
  now: string,
): Project {
  return {
    id: makeId('proj', now),
    name: input.name,
    summary: input.summary ?? '',
    area: input.area ?? '',
    status: input.status ?? 'active',
    nextAction: input.nextAction ?? '',
    dueAt: input.dueAt ?? '',
    people: input.people ?? [],
    waitingOn: [],
    deliverables: [],
    journal: [],
    links: [],
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    archivedAt: null,
    order: null,
  }
}

export function touch(project: Project, now: string): Project {
  return { ...project, updatedAt: now }
}

/**
 * Waiting is derived, never asserted twice: while anything is outstanding
 * the project is `waiting`, and resolving the LAST wait returns it to
 * `active`. Two places to say the same thing is how a tracker starts
 * lying — so status follows the list rather than being set alongside it.
 */
function withWaitingStatus(project: Project, waitingOn: WaitingOn[]): Project {
  if (waitingOn.length > 0) return { ...project, waitingOn, status: 'waiting' }
  return {
    ...project,
    waitingOn,
    status: project.status === 'waiting' ? 'active' : project.status,
  }
}

export function addWaitingOn(
  project: Project,
  waiting: { person: string; what: string; askedAt: string },
  now: string,
): Project {
  if (!waiting.person.trim()) return project
  const entry: WaitingOn = {
    id: makeId('wait', now),
    person: waiting.person.trim(),
    what: waiting.what.trim(),
    askedAt: waiting.askedAt,
  }
  return touch(withWaitingStatus(project, [...project.waitingOn, entry]), now)
}

/** Resolve one wait by id, or every wait when no id is given. */
export function resolveWaitingOn(
  project: Project,
  waitingId: string | null,
  now: string,
): Project {
  const remaining = waitingId
    ? project.waitingOn.filter(item => item.id !== waitingId)
    : []
  if (remaining.length === project.waitingOn.length && waitingId) return project
  return touch(withWaitingStatus(project, remaining), now)
}

export function addDeliverable(
  project: Project,
  input: { title: string; owner?: string; dueAt?: string },
  now: string,
): Project {
  const deliverable: Deliverable = {
    id: makeId('del', now),
    title: input.title,
    owner: input.owner ?? '',
    dueAt: input.dueAt ?? '',
    doneAt: null,
  }
  return touch({ ...project, deliverables: [...project.deliverables, deliverable] }, now)
}

/**
 * The next action and the deliverable it names are the same fact written
 * twice — the link between them is the matching title, not a stored id, so
 * there is no reference to migrate and nothing to leave dangling. Open
 * deliverables only: a finished one is history, and history is never next.
 */
export function nextDeliverable(project: Project): Deliverable | null {
  const key = project.nextAction.trim().toLowerCase()
  if (!key) return null
  return (
    project.deliverables.find(
      deliverable => !deliverable.doneAt && deliverable.title.trim().toLowerCase() === key,
    ) ?? null
  )
}

/**
 * Promote a deliverable to the next action. The project already holds the
 * answer to "what now?" in its list — this is the one click that says which
 * of them it is, instead of retyping the line underneath itself.
 */
export function setNextActionFromDeliverable(
  project: Project,
  deliverableId: string,
  now: string,
): Project {
  const deliverable = project.deliverables.find(item => item.id === deliverableId)
  if (!deliverable || deliverable.doneAt) return project
  if (project.nextAction === deliverable.title) return project
  return touch({ ...project, nextAction: deliverable.title }, now)
}

export function updateDeliverable(
  project: Project,
  deliverableId: string,
  patch: { title?: string; owner?: string; dueAt?: string; done?: boolean },
  now: string,
): Project {
  const wasNext = nextDeliverable(project)?.id === deliverableId
  const deliverables = project.deliverables.map(deliverable => {
    if (deliverable.id !== deliverableId) return deliverable
    return {
      ...deliverable,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.owner !== undefined ? { owner: patch.owner } : {}),
      ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt } : {}),
      ...(patch.done !== undefined ? { doneAt: patch.done ? now : null } : {}),
    }
  })
  // A next action that names this deliverable follows it: renaming keeps the
  // two in step, and completing it empties the bar rather than leaving the
  // headline advertising work that is already done.
  const nextAction = !wasNext
    ? project.nextAction
    : patch.done
      ? ''
      : patch.title !== undefined
        ? patch.title
        : project.nextAction
  return touch({ ...project, deliverables, nextAction }, now)
}

export function logJournalEntry(
  project: Project,
  entry: { title: string; body?: string },
  now: string,
): Project {
  const journalEntry: JournalEntry = {
    id: makeId('jrn', now),
    at: now,
    title: entry.title,
    body: entry.body ?? '',
  }
  // Newest first: the journal is read from the top far more than the bottom.
  return touch({ ...project, journal: [journalEntry, ...project.journal] }, now)
}

export function linkDocument(
  project: Project,
  link: { label: string; path: string; kind?: ProjectLink['kind'] },
  now: string,
): Project {
  const existing = project.links.find(item => item.path === link.path)
  if (existing) return project
  const projectLink: ProjectLink = {
    id: makeId('lnk', now),
    label: link.label,
    path: link.path,
    kind: link.kind ?? 'document',
  }
  return touch({ ...project, links: [...project.links, projectLink] }, now)
}

/**
 * The waiting line for a compact row: the oldest wait names itself and
 * the rest are counted, so a project stalled on three people does not
 * silently read as stalled on one.
 */
/**
 * The waits, one line each, for a list or card cell.
 *
 * A single joined string put the count last — after a long "what" that
 * wrapped — so "+1 more" was the least visible part of the most important
 * fact. Callers render these as lines and show the count somewhere fixed.
 */
export function waitingLines(
  project: Project,
  max = 2,
): { lines: string[]; overflow: number } {
  const lines = project.waitingOn
    .slice(0, max)
    .map(wait => `${wait.person}${wait.what ? ` — ${wait.what}` : ''}`)
  return { lines, overflow: Math.max(0, project.waitingOn.length - lines.length) }
}

export function waitingSummary(project: Project): string {
  const [first, ...rest] = project.waitingOn
  if (!first) return ''
  const head = `${first.person}${first.what ? ` — ${first.what}` : ''}`
  return rest.length ? `${head} +${rest.length} more` : head
}

export function completedCount(project: Project): number {
  return project.deliverables.filter(deliverable => deliverable.doneAt).length
}

/** Whole days from `now` to `dueAt`; negative is overdue. Null when undated. */
export function daysUntil(dueAt: string, now: Date): number | null {
  if (!dueAt) return null
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return null
  const startOfDay = (date: Date): number =>
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000)
}

/**
 * Overdue is a DERIVED reading of a live date, never a stored status: a
 * project cannot be marked overdue and then quietly stay that way after
 * the date moves. Done projects are never overdue, whenever they closed.
 */
export function isOverdue(project: Project, now: Date): boolean {
  if (project.status === 'done') return false
  const days = daysUntil(project.dueAt, now)
  return days !== null && days < 0
}

/** Has the list ever been arranged by hand? */
export function hasManualOrder(projects: Project[]): boolean {
  return projects.some(project => project.order !== null)
}

/**
 * The order the front page shows. Until someone drags something this is the
 * urgency sort; after that, their arrangement wins — a list that quietly
 * re-sorted itself would make dragging a lie.
 *
 * Unplaced projects (order null) sit ABOVE the arranged ones, still in
 * urgency order among themselves. A project created after the list was
 * arranged would otherwise land at the bottom, out of sight.
 */
export function sortForDisplay(projects: Project[], now: Date): Project[] {
  if (!hasManualOrder(projects)) return sortForList(projects, now)
  const unplaced = projects.filter(project => project.order === null)
  const placed = projects
    .filter(project => project.order !== null)
    .sort((a, b) => (a.order as number) - (b.order as number))
  return [...sortForList(unplaced, now), ...placed]
}

/**
 * Write a whole sequence down as the new order. Takes every id in the list,
 * not just the moved one: a partial order is how two projects end up claiming
 * the same position and the list jitters on every render.
 */
export function applyManualOrder(
  projects: Project[],
  orderedIds: string[],
  now: string,
): Project[] {
  const positions = new Map(orderedIds.map((id, index) => [id, index]))
  return projects.map(project => {
    const next = positions.get(project.id)
    if (next === undefined || project.order === next) return project
    return touch({ ...project, order: next }, now)
  })
}

/** The sequence `sourceId` dropped before/after `targetId` produces. */
export function sequenceAfterMove(
  ordered: Project[],
  sourceId: string,
  targetId: string,
  place: 'before' | 'after',
): string[] {
  if (sourceId === targetId) return ordered.map(project => project.id)
  const ids = ordered.map(project => project.id).filter(id => id !== sourceId)
  const at = ids.indexOf(targetId)
  if (at === -1) return ordered.map(project => project.id)
  ids.splice(place === 'before' ? at : at + 1, 0, sourceId)
  return ids
}

export function isArchived(project: Project): boolean {
  return project.archivedAt !== null
}

/**
 * Put a project out of view without losing a thing. Status, waits, journal,
 * deliverables and documents all stay exactly as they are — archiving is a
 * statement about attention, not about the work.
 */
export function archiveProject(project: Project, now: string): Project {
  if (project.archivedAt) return project
  return touch({ ...project, archivedAt: now }, now)
}

/** Bring it back, still standing where it stood. */
export function restoreProject(project: Project, now: string): Project {
  if (!project.archivedAt) return project
  return touch({ ...project, archivedAt: null }, now)
}

/** The projects in play. Everything the app counts or lists starts here. */
export function livingProjects(projects: Project[]): Project[] {
  return projects.filter(project => !project.archivedAt)
}

export function archivedProjects(projects: Project[]): Project[] {
  return projects.filter(project => project.archivedAt)
}

export function hasNoNextAction(project: Project): boolean {
  return project.status !== 'done' && project.nextAction.trim() === ''
}

export interface ProjectsSummary {
  total: number
  byStatus: Record<ProjectStatus, number>
  overdue: number
  waiting: number
  noNextAction: number
  dueThisWeek: number
}

export function summarize(projects: Project[], now: Date): ProjectsSummary {
  const byStatus: Record<ProjectStatus, number> = { idea: 0, active: 0, waiting: 0, done: 0 }
  let overdue = 0
  let waiting = 0
  let noNextAction = 0
  let dueThisWeek = 0
  for (const project of projects) {
    byStatus[project.status] += 1
    if (isOverdue(project, now)) overdue += 1
    // `waitingOn` became an array when waits started stacking, and an empty
    // array is truthy — this counted every project, so the rail said "5
    // waiting on someone" over a list holding one.
    if (project.waitingOn.length > 0) waiting += 1
    if (hasNoNextAction(project)) noNextAction += 1
    const days = daysUntil(project.dueAt, now)
    if (project.status !== 'done' && days !== null && days >= 0 && days <= 7) dueThisWeek += 1
  }
  return { total: projects.length, byStatus, overdue, waiting, noNextAction, dueThisWeek }
}

/**
 * Sort for the list: what needs attention first. Overdue, then soonest
 * due, then undated. Done projects sink regardless of their dates.
 */
export function sortForList(projects: Project[], now: Date): Project[] {
  return [...projects].sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1
    const aDays = daysUntil(a.dueAt, now)
    const bDays = daysUntil(b.dueAt, now)
    if (aDays === null && bDays === null) return a.name.localeCompare(b.name)
    if (aDays === null) return 1
    if (bDays === null) return -1
    if (aDays !== bDays) return aDays - bDays
    return a.name.localeCompare(b.name)
  })
}

/**
 * Search the whole project, not just its cover. The box has always said
 * "projects, people, documents" while only ever reading the name, summary,
 * area, next action and people — so typing a document's name, or the thing
 * you are waiting on someone for, found nothing and looked like the project
 * was gone.
 */
export function matchesQuery(project: Project, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [
    project.name,
    project.nextAction,
    project.area,
    project.summary,
    ...project.people,
    ...project.deliverables.map(item => `${item.title} ${item.owner}`),
    ...project.links.map(link => link.label),
    ...project.waitingOn.map(wait => `${wait.person} ${wait.what}`),
    ...project.journal.map(entry => `${entry.title} ${entry.body}`),
  ]
    .join(' ')
    .toLowerCase()
    .includes(needle)
}

/** How the list is ordered. `manual` is the arrangement, urgency until made. */
export type ProjectSort = 'manual' | 'urgency' | 'due' | 'name' | 'updated'

export const PROJECT_SORT_LABELS: Record<ProjectSort, string> = {
  manual: 'My order',
  urgency: 'Urgency',
  due: 'Due date',
  name: 'Name',
  updated: 'Recently changed',
}

export function sortProjects(
  projects: Project[],
  sort: ProjectSort,
  now: Date,
): Project[] {
  switch (sort) {
    case 'urgency':
      return sortForList(projects, now)
    case 'due':
      // Undated last rather than first: no date is the absence of a deadline,
      // not the most distant one.
      return [...projects].sort((a, b) => {
        const aDue = a.dueAt || ''
        const bDue = b.dueAt || ''
        if (!aDue && !bDue) return a.name.localeCompare(b.name)
        if (!aDue) return 1
        if (!bDue) return -1
        return aDue.localeCompare(bDue) || a.name.localeCompare(b.name)
      })
    case 'name':
      return [...projects].sort((a, b) => a.name.localeCompare(b.name))
    case 'updated':
      return [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    default:
      return sortForDisplay(projects, now)
  }
}

export function removeDeliverable(
  project: Project,
  deliverableId: string,
  now: string,
): Project {
  const wasNext = nextDeliverable(project)?.id === deliverableId
  const deliverables = project.deliverables.filter(item => item.id !== deliverableId)
  if (deliverables.length === project.deliverables.length) return project
  return touch(
    { ...project, deliverables, ...(wasNext ? { nextAction: '' } : {}) },
    now,
  )
}

/**
 * Carry a deliverable from one project to another, unchanged: same title,
 * owner, date and done state, the same id. The source forgets it (and its
 * next action, if that was it); the target lists it last. Both are
 * touched, so both read as changed. Nothing happens unless both projects
 * exist and the deliverable is in the source.
 */
export function moveDeliverable(
  store: ProjectsStore,
  input: { fromProjectId: string; deliverableId: string; toProjectId: string },
  now: string,
): ProjectsStore {
  if (input.fromProjectId === input.toProjectId) return store
  const from = store.projects.find(project => project.id === input.fromProjectId)
  const to = store.projects.find(project => project.id === input.toProjectId)
  const deliverable = from?.deliverables.find(item => item.id === input.deliverableId)
  if (!from || !to || !deliverable) return store
  return {
    ...store,
    projects: store.projects.map(project => {
      if (project.id === from.id) return removeDeliverable(project, deliverable.id, now)
      if (project.id === to.id) {
        return touch({ ...project, deliverables: [...project.deliverables, { ...deliverable }] }, now)
      }
      return project
    }),
  }
}

/**
 * Repoint every link that referenced a moved package, in whichever
 * project holds it. A rename moves the folder for everyone, so a link in
 * another project would otherwise be left pointing at a path that no
 * longer exists.
 */
export function repointLinks(
  projects: Project[],
  fromPath: string,
  to: { path: string; label: string },
  now: string,
): Project[] {
  return projects.map(project => {
    if (!project.links.some(link => link.path === fromPath)) return project
    return touch(
      {
        ...project,
        links: project.links.map(link =>
          link.path === fromPath ? { ...link, path: to.path, label: to.label } : link,
        ),
      },
      now,
    )
  })
}

/** Rename a link's display label without touching what it points at. */
export function renameLinkLabel(
  project: Project,
  linkId: string,
  label: string,
  now: string,
): Project {
  return touch(
    {
      ...project,
      links: project.links.map(link =>
        link.id === linkId ? { ...link, label } : link,
      ),
    },
    now,
  )
}

export function removeLink(project: Project, linkId: string, now: string): Project {
  const links = project.links.filter(item => item.id !== linkId)
  if (links.length === project.links.length) return project
  return touch({ ...project, links }, now)
}

/**
 * Editing and removing journal entries is a HUMAN affordance only. The
 * agent tool appends and can do nothing else: the journal is the project's
 * memory, and an assistant quietly rewriting what was decided last month
 * is the failure this shape exists to prevent. A person fixing their own
 * typo is a different act, so the UI offers it.
 */
export function editJournalEntry(
  project: Project,
  entryId: string,
  patch: { title?: string; body?: string },
  now: string,
): Project {
  const journal = project.journal.map(entry =>
    entry.id === entryId
      ? {
          ...entry,
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
        }
      : entry,
  )
  return touch({ ...project, journal }, now)
}

export function removeJournalEntry(
  project: Project,
  entryId: string,
  now: string,
): Project {
  const journal = project.journal.filter(entry => entry.id !== entryId)
  if (journal.length === project.journal.length) return project
  return touch({ ...project, journal }, now)
}
