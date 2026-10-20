/**
 * How items on screen are named to the suite's agent activity layer (AgentActivityLayer, in AppFrame). An agent's
 * call that reads or changes an item is drawn on it as it happens: the layer matches `data-agent-ref` (space-separated)
 * against the call's arguments (plain and `argName:value`) and, for reads, the ids in the answer.
 *
 * Each ref here is exactly what a tool in plugin.json passes for that kind of item. Markup only.
 */
import type { Deliverable, Project, ProjectLink, WaitingOn } from '../types'

export interface AgentRefProps {
  'data-agent-ref': string
  'data-agent-label': string
}

/**
 * The layer splits a tag on whitespace, so a value with a space in it (a document path like `My Notes.document`) can
 * never match; it is left out rather than split into fragments that could match something else.
 */
function tag(id: string | undefined, argNames: string[], label: string): AgentRefProps {
  const refs = id && !/\s/.test(id) ? [id, ...argNames.map(name => `${name}:${id}`)] : []
  return { 'data-agent-ref': refs.join(' '), 'data-agent-label': label }
}

/** A project: every tool's `projectId`, plus reorderProject's `targetProjectId` and moveDeliverable's `toProjectId`. */
export function projectAgentRefs(project: Pick<Project, 'id' | 'name'>): AgentRefProps {
  return tag(project.id, ['projectId', 'targetProjectId', 'toProjectId'], project.name)
}

/** A deliverable: update/remove/moveDeliverable's `deliverableId` (getProject answers it as `id`). */
export function deliverableAgentRefs(deliverable: Pick<Deliverable, 'id' | 'title'>): AgentRefProps {
  return tag(deliverable.id, ['deliverableId'], deliverable.title)
}

/** A wait: setWaitingOn's `resolveWaitingId` (listProjects/getProject answer it as `waitingId`). */
export function waitingAgentRefs(wait: Pick<WaitingOn, 'id' | 'person'>): AgentRefProps {
  return tag(wait.id, ['waitingId', 'resolveWaitingId'], `Waiting on ${wait.person}`)
}

/**
 * A linked item: removeLink's `linkId`, and its path as the document tools take it (`path`, and the export tools'
 * `paths` array, which the layer reads with the key `paths`).
 */
export function linkAgentRefs(link: Pick<ProjectLink, 'id' | 'path' | 'label'>): AgentRefProps {
  const byId = tag(link.id, ['linkId'], link.label)
  const byPath = tag(link.path, ['path', 'paths'], link.label)
  return {
    'data-agent-ref': [byId['data-agent-ref'], byPath['data-agent-ref']].filter(Boolean).join(' '),
    'data-agent-label': link.label,
  }
}

/** The open document's editor surface: the document tools' `path` (readDocument, insert/replace/deleteDocumentBlock). */
export function documentAgentRefs(packagePath: string, label: string): AgentRefProps {
  return tag(packagePath, ['path', 'paths'], label)
}
