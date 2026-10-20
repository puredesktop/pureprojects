import { describe, expect, it } from 'vitest'
import { deliverableAgentRefs, documentAgentRefs, linkAgentRefs, projectAgentRefs, waitingAgentRefs } from './agentRefs'

const refs = (props: { 'data-agent-ref': string }): string[] => props['data-agent-ref'].split(' ').filter(Boolean)

describe('agent refs', () => {
  it('names a project by every argument that points at one', () => {
    expect(refs(projectAgentRefs({ id: 'p1', name: 'Book' }))).toEqual([
      'p1',
      'projectId:p1',
      'targetProjectId:p1',
      'toProjectId:p1',
    ])
  })

  it('names deliverables, waits and links by the ids the tools take', () => {
    expect(refs(deliverableAgentRefs({ id: 'd1', title: 'Draft' }))).toEqual(['d1', 'deliverableId:d1'])
    expect(refs(waitingAgentRefs({ id: 'w1', person: 'Ana' }))).toEqual(['w1', 'waitingId:w1', 'resolveWaitingId:w1'])
    expect(refs(linkAgentRefs({ id: 'l1', path: '/Pure/Notes.document', label: 'Notes' }))).toEqual([
      'l1',
      'linkId:l1',
      '/Pure/Notes.document',
      'path:/Pure/Notes.document',
      'paths:/Pure/Notes.document',
    ])
  })

  it('leaves out a path with a space rather than splitting it', () => {
    expect(documentAgentRefs('/Pure/My Notes.document', 'My Notes')['data-agent-ref']).toBe('')
    expect(refs(linkAgentRefs({ id: 'l2', path: '/Pure/My Notes.document', label: 'My Notes' }))).toEqual(['l2', 'linkId:l2'])
  })
})
