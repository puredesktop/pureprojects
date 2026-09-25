import { describe, expect, it } from 'vitest'
import type { PlatformOperation } from '../bridge/platformBridge'
import {
  activityLabel,
  activityWhen,
  journalDraftFromActivity,
  projectActivity,
} from './projectActivity'

const NOW = new Date('2026-08-25T13:40:00.000Z')

function op(over: Partial<PlatformOperation>): PlatformOperation {
  return {
    id: 'op1',
    at: '2026-08-25T13:38:00.000Z',
    lane: 'user',
    kind: 'project.updated',
    appSlug: 'projects',
    summary: 'Updated something',
    refs: { projectId: 'p1' },
    ...over,
  } as PlatformOperation
}

describe('reading a project name out of a ledger summary', () => {
  it('trims the project off the end, whichever joiner was used', () => {
    expect(activityLabel('Waiting on Amy for Trust Admin', 'Trust Admin')).toBe(
      'Waiting on Amy',
    )
    expect(activityLabel('A wait cleared on Trust Admin', 'Trust Admin')).toBe(
      'A wait cleared',
    )
  })

  it('trims a quoted project name', () => {
    expect(activityLabel('Updated “Trust Admin”', 'Trust Admin')).toBe('Updated')
  })

  it('trims a leading project name and recapitalises', () => {
    expect(
      activityLabel('Trust Admin is no longer waiting on anyone', 'Trust Admin'),
    ).toBe('Is no longer waiting on anyone')
  })

  it('leaves a summary that never names the project alone', () => {
    expect(activityLabel('Added 6 deliverables', 'Trust Admin')).toBe(
      'Added 6 deliverables',
    )
    // a name appearing mid-sentence is content, not a suffix
    expect(
      activityLabel('Linked Trust Admin deed to the file', 'Trust Admin'),
    ).toBe('Linked Trust Admin deed to the file')
  })

  it('never returns an empty label', () => {
    expect(activityLabel('Trust Admin', 'Trust Admin')).toBe('Trust Admin')
  })
})

describe('selecting a project’s activity', () => {
  it('keeps only this app and this project, newest first', () => {
    const rows = projectActivity(
      [
        op({ id: 'a', at: '2026-08-25T10:00:00.000Z' }),
        op({ id: 'b', at: '2026-08-25T12:00:00.000Z' }),
        op({ id: 'other-project', refs: { projectId: 'p2' } }),
        op({ id: 'other-app', appSlug: 'mail' }),
        op({ id: 'no-refs', refs: undefined }),
      ],
      'p1',
      'Trust Admin',
    )
    expect(rows.map(row => row.id)).toEqual(['b', 'a'])
  })

  it('carries the lane through, so agent work can be marked', () => {
    const rows = projectActivity([op({ lane: 'agent' })], 'p1', 'Trust Admin')
    expect(rows[0]!.lane).toBe('agent')
  })
})

describe('when it happened', () => {
  it('counts minutes, then hours, then falls back to the day', () => {
    expect(activityWhen('2026-08-25T13:39:40.000Z', NOW)).toBe('now')
    expect(activityWhen('2026-08-25T13:38:00.000Z', NOW)).toBe('2m')
    expect(activityWhen('2026-08-25T11:40:00.000Z', NOW)).toBe('2h')
    expect(activityWhen('2026-08-24T09:00:00.000Z', NOW)).toBe('Yesterday')
    expect(activityWhen('not a date', NOW)).toBe('')
  })
})

describe('promoting an action into the journal', () => {
  it('seeds the title from the action and leaves the why to the user', () => {
    const draft = journalDraftFromActivity({
      id: 'a',
      label: 'A wait cleared',
      at: NOW.toISOString(),
      lane: 'user',
    })
    expect(draft).toEqual({ title: 'A wait cleared', body: '' })
  })
})
