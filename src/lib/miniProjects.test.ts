import { describe, expect, it } from 'vitest'
import type { Project } from '../types'
import { needsYouFirst, standing } from './miniProjects'
import { createProject } from './projectModel'

const NOW = new Date('2026-11-02T12:00:00Z')
const AT = '2026-10-01T00:00:00Z'
const project = (name: string, patch: Partial<Project> = {}): Project => ({ ...createProject({ name }, AT), nextAction: 'Do it', ...patch })
const wait = { id: 'w', person: 'Vincent', what: 'the list', askedAt: '2026-10-20' }

describe('which project needs you first', () => {
  it('late, then no next step, then due within the week, then waiting, then the rest', () => {
    const rest = project('rest')
    const waiting = project('waiting', { waitingOn: [wait] })
    const soon = project('soon', { dueAt: '2026-11-05' })
    const noStep = project('no step', { nextAction: '' })
    const late = project('late', { dueAt: '2026-10-30' })
    expect(needsYouFirst([rest, waiting, soon, noStep, late], NOW).map(p => p.name)).toEqual(['late', 'no step', 'soon', 'waiting', 'rest'])
  })

  it('the nearest date first among equals, then your own order; what is done is not here', () => {
    const later = project('later', { dueAt: '2026-11-08' })
    const nearer = project('nearer', { dueAt: '2026-11-04' })
    const finished = project('finished', { status: 'done', dueAt: '2026-10-01' })
    const a = project('a'), b = project('b')
    expect(needsYouFirst([a, later, b, nearer, finished], NOW).map(p => p.name)).toEqual(['nearer', 'later', 'a', 'b'])
  })
})

describe('how a project stands', () => {
  it('says so in the words a row can say', () => {
    expect(standing(project('x', { dueAt: '2026-10-31' }), NOW)).toEqual({ words: '2 days late', tone: 'bad' })
    expect(standing(project('x', { nextAction: '' }), NOW)).toEqual({ words: 'No next step', tone: 'warn' })
    expect(standing(project('x', { waitingOn: [wait] }), NOW).words).toBe('Waiting on Vincent')
    expect(standing(project('x', { waitingOn: [wait, { ...wait, id: 'w2' }] }), NOW).words).toBe('Waiting on Vincent and 1 more')
    expect(standing(project('x', { dueAt: '2026-11-02' }), NOW).words).toBe('Due today')
    expect(standing(project('x', { dueAt: '2026-11-03' }), NOW).words).toBe('Due tomorrow')
    expect(standing(project('x'), NOW).words).toBe('')
  })
})
