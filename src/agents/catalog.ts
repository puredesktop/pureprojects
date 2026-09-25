import type { Extensions } from '@tiptap/react'
import type { Project, ProjectsStore } from '../types'

/** Keep in sync with `plugin.json` → `app.agents.tools[].name`. */
export const PUREPROJECTS_AGENT_TOOL_NAMES = [
  'getProjectsContext',
  'listProjects',
  'getProject',
  'createProject',
  'updateProject',
  'addDeliverable',
  'updateDeliverable',
  'setWaitingOn',
  'logJournalEntry',
  'createDocument',
  'readDocument',
  'insertDocumentBlock',
  'replaceDocumentBlock',
  'deleteDocumentBlock',
  'exportDocumentsPdf',
  'exportProjectZip',
  'reorderProject',
  'linkDocument',
  'removeLink',
  'removeDeliverable',
  'moveDeliverable',
  'archiveProject',
  'deleteProject',
] as const

export const PUREPROJECTS_AGENT_LOG_LABEL = 'pureprojects'

export class AgentProjectsToolError extends Error {}

/**
 * Live app state the handlers act on. Handlers receive `contextRef.current`
 * so a mid-render invoke sees current state, and every mutation goes
 * through the app's own callback — tools never write the store directly,
 * so the open UI and the persisted store can never disagree.
 *
 * IMPORTANT: `store` is one instance's last-loaded snapshot and may be
 * stale. Delegation opens the app in a SECOND background tab, so a tool
 * call frequently runs in an instance that booted before the user's own
 * window made a change — that instance reported zero projects while the
 * visible window showed one. Read handlers therefore call `refresh()`
 * first and work from what it returns; `store` is only a starting value.
 */
export interface ProjectsAgentToolContext {
  store: ProjectsStore
  /** Re-read the persisted store and adopt it as this instance's state. */
  refresh: () => Promise<ProjectsStore>
  /** Now, injected so tests are deterministic. */
  now: () => Date
  /** Apply a change to the store and persist it. */
  mutate: (fn: (store: ProjectsStore) => ProjectsStore) => Promise<ProjectsStore>
  /** Bring a project into view after the agent changes it. */
  focusProject: (projectId: string) => void
  /**
   * The project the user currently has open, if any.
   *
   * focusProject pointed agent → UI and nothing pointed back, so an agent
   * asked to "make a document" while Trust Admin was on screen had no way to
   * know that and filed it under a different project. "This project" is only
   * answerable if the app says which one it is.
   */
  openProjectId: () => string | null
  /**
   * Create a `.document` package in the workspace and link it. Lives on the
   * context rather than in the handler because it needs the fs bridge.
   */
  createDocument: (input: {
    projectId: string
    title: string
    html?: string
  }) => Promise<{ path: string; name: string }>
  /**
   * Read and write a linked `.document` package. Like createDocument these
   * need the fs bridge, so they live on the context rather than the handler.
   */
  readDocument: (path: string) => Promise<string>
  writeDocument: (path: string, html: string) => Promise<void>
  /**
   * The editor's extension list. Block edits are parsed and serialized with
   * the same schema the reader mounts, so an agent cannot write markup the
   * document would then refuse to show.
   */
  documentExtensions: () => Extensions
  /** Print documents to PDF beside their packages; returns what was written. */
  exportDocumentsPdf: (
    projectId: string,
    packagePaths: string[],
  ) => Promise<{ written: string[]; skipped: number }>
  /** Bundle documents into a zip and return its path. */
  exportProjectZip: (
    projectId: string,
    packagePaths: string[],
  ) => Promise<string>
}

export function findProject(store: ProjectsStore, projectId: string): Project | undefined {
  return store.projects.find(project => project.id === projectId)
}
