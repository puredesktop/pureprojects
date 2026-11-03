import type { Project } from '../types'
import { daysUntil, hasNoNextAction, isOverdue } from './projectModel'

/**
 * What the mini app works from, held in a page beside a conversation. The whole app is a list you arrange; here it is a
 * question: which project needs me first, and what is its one next step?
 */
export type Tone = 'bad' | 'warn' | 'plain'

const rank = (project: Project, now: Date): number => {
  if (isOverdue(project, now)) return 0
  if (hasNoNextAction(project)) return 1
  if (project.waitingOn.length) return 3
  const days = daysUntil(project.dueAt, now)
  return days !== null && days <= 7 ? 2 : 4
}

/** Open projects, whichever needs you first on top; within that, the nearest date, then your own order. */
export function needsYouFirst(projects: readonly Project[], now: Date): Project[] {
  return projects
    .filter(project => project.status !== 'done')
    .map((project, index) => ({ project, index }))
    .sort((a, b) =>
      rank(a.project, now) - rank(b.project, now)
      || (daysUntil(a.project.dueAt, now) ?? Number.MAX_SAFE_INTEGER) - (daysUntil(b.project.dueAt, now) ?? Number.MAX_SAFE_INTEGER)
      || a.index - b.index)
    .map(entry => entry.project)
}

/** How a project stands, in the words a row can say. */
export function standing(project: Project, now: Date): { words: string; tone: Tone } {
  if (isOverdue(project, now)) {
    const days = Math.abs(daysUntil(project.dueAt, now) ?? 0)
    return { words: days === 1 ? '1 day late' : `${days} days late`, tone: 'bad' }
  }
  if (hasNoNextAction(project)) return { words: 'No next step', tone: 'warn' }
  if (project.waitingOn.length) {
    const [first, ...rest] = project.waitingOn
    return { words: `Waiting on ${first!.person}${rest.length ? ` and ${rest.length} more` : ''}`, tone: 'plain' }
  }
  const days = daysUntil(project.dueAt, now)
  if (days === null) return { words: '', tone: 'plain' }
  return { words: days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`, tone: 'plain' }
}
