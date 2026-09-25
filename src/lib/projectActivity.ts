import type { PlatformOperation } from '../bridge/platformBridge'
import { PROJECTS_APP_SLUG } from '../constants'

/**
 * The activity list is a READ of the operations ledger, not a second
 * store: every mutation here already records an entry carrying
 * `refs.projectId`, so a project's history exists whether or not anyone
 * looks at it. Nothing is written for the list's benefit.
 */

export interface ProjectActivityRow {
  id: string
  /** Ledger summary, phrased for reading inside the project. */
  label: string
  at: string
  lane: PlatformOperation['lane']
}

/**
 * Ledger summaries are written for the SUITE-wide ledger, where naming
 * the project is the only way to know which one moved. Inside that
 * project the name is noise, so the known name is trimmed off the ends
 * it actually appears at — by exact match, never by guessing at
 * sentence shape.
 */
export function activityLabel(summary: string, projectName: string): string {
  const name = projectName.trim()
  let text = summary.trim()
  if (!name) return text

  // "Waiting on Amy for Trust Admin" / "A wait cleared on Trust Admin"
  for (const joiner of [' for ', ' on ', ' in ', ' to ']) {
    const tail = `${joiner}${name}`
    if (text.endsWith(tail)) {
      text = text.slice(0, -tail.length)
      break
    }
  }
  // "Updated “Trust Admin”" — the quoted name carries no extra meaning here.
  for (const quoted of [`“${name}”`, `"${name}"`, `‘${name}’`]) {
    if (text.endsWith(` ${quoted}`)) {
      text = text.slice(0, -(quoted.length + 1))
      break
    }
  }
  // "Trust Admin is no longer waiting on anyone"
  if (text.startsWith(`${name} `)) {
    const rest = text.slice(name.length + 1)
    text = rest.charAt(0).toUpperCase() + rest.slice(1)
  }
  return text || summary.trim()
}

/** This project's entries, newest first. */
export function projectActivity(
  operations: PlatformOperation[],
  projectId: string,
  projectName: string,
): ProjectActivityRow[] {
  return operations
    .filter(
      operation =>
        operation.appSlug === PROJECTS_APP_SLUG &&
        operation.refs?.projectId === projectId,
    )
    .map(operation => ({
      id: operation.id,
      label: activityLabel(operation.summary, projectName),
      at: operation.at,
      lane: operation.lane,
    }))
    .sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * "2m" / "40m" / "3h" / "Yesterday" / "12 Aug" — the same shorthand the
 * rest of the app uses for a time that only needs to be roughly placed.
 */
export function activityWhen(at: string, now: Date): string {
  const then = new Date(at)
  if (Number.isNaN(then.getTime())) return ''
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 8) return `${hours}h`
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  if (then >= startOfToday) {
    return then.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  if (then >= startOfYesterday) return 'Yesterday'
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** A journal entry seeded from an action the user decided mattered. */
export function journalDraftFromActivity(row: ProjectActivityRow): {
  title: string
  body: string
} {
  return { title: row.label, body: '' }
}
