/**
 * A project is knowledge work, not a code change: it is shaped by a
 * deadline, the people involved, and the one next step. The states reflect
 * that — `waiting` is first-class because knowledge work stalls on other
 * people far more often than on effort, and a stall nobody can see is a
 * deadline missed later.
 */
export type ProjectStatus = 'idea' | 'active' | 'waiting' | 'done'

export interface Deliverable {
  id: string
  title: string
  /** Who owes it. Empty means the user. */
  owner: string
  /** ISO date, or empty when undated. */
  dueAt: string
  doneAt: string | null
}

/** Append-only: the project's memory, not a log of activity. */
export interface JournalEntry {
  id: string
  at: string
  title: string
  body: string
}

/**
 * `web` is a page on the internet; the rest are resources inside the
 * workspace. They live in one list because to the user they are one
 * list — this project's reference material — but they open by
 * different routes.
 */
export type LinkKind = 'document' | 'mail' | 'event' | 'web'

export interface ProjectLink {
  id: string
  label: string
  /** Workspace path, or an app reference for mail and calendar. */
  path: string
  kind: LinkKind
}

/** Who the ball is with, what for, and since when. */
export interface WaitingOn {
  id: string
  person: string
  what: string
  askedAt: string
}

export interface Project {
  id: string
  name: string
  summary: string
  area: string
  status: ProjectStatus
  /** The single next physical step. Empty is a defect worth surfacing. */
  nextAction: string
  dueAt: string
  people: string[]
  /**
   * Every open wait, oldest first. Real work stalls on several people at
   * once — the funder list AND the signed contract — and a tracker that
   * can only hold one of those quietly forgets the others.
   */
  waitingOn: WaitingOn[]
  deliverables: Deliverable[]
  journal: JournalEntry[]
  links: ProjectLink[]
  createdAt: string
  updatedAt: string
  closedAt: string | null
  /**
   * When this project was put out of view, or null while it is in play.
   *
   * Deliberately NOT a fifth status. Archiving is orthogonal to how a project
   * stood: something abandoned mid-flight is archived AND waiting, something
   * finished and filed is archived AND done. Folding the two together would
   * destroy the answer to "where had this got to?" — which is the whole
   * reason for keeping the data instead of deleting it.
   */
  archivedAt: string | null
  /**
   * Where the person put this in the list, or null while they never have.
   *
   * Null is not "position zero" — it means unplaced, and unplaced projects
   * sit above the arranged ones. A project created after the list was
   * arranged must not appear at the bottom of a long list where nobody looks;
   * it waits at the top until it is put somewhere.
   */
  order: number | null
}

export interface ProjectsStore {
  storeVersion: number
  projects: Project[]
}
