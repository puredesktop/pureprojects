import { describe, expect, it } from 'vitest'
import {
  addDeliverable,
  applyManualOrder,
  archiveProject,
  archivedProjects,
  isArchived,
  hasManualOrder,
  livingProjects,
  restoreProject,
  sequenceAfterMove,
  sortForDisplay,
  sortProjects,
  nextDeliverable,
  setNextActionFromDeliverable,
  editJournalEntry,
  createProject,
  daysUntil,
  hasNoNextAction,
  isOverdue,
  linkDocument,
  matchesQuery,
  logJournalEntry,
  removeDeliverable,
  removeJournalEntry,
  removeLink,
  renameLinkLabel,
  repointLinks,
  parseStore,
  addWaitingOn,
  resolveWaitingOn,
  waitingLines,
  waitingSummary,
  sortForList,
  summarize,
  moveDeliverable,
  updateDeliverable,
} from './projectModel'
import type { Project } from '../types'

const NOW = '2026-08-25T09:00:00.000Z'
const TODAY = new Date(NOW)

function project(patch: Partial<Project> = {}): Project {
  return { ...createProject({ name: 'Method book' }, NOW), ...patch }
}

describe('moving a deliverable to another project', () => {
  it('carries it over unchanged, forgets it at the source, and leaves nothing half-done', () => {
    const source = addDeliverable(project({ id: 'p1', name: 'Book' }), { title: 'Copy edit', owner: 'Ana', dueAt: '2026-09-01' }, NOW)
    const target = project({ id: 'p2', name: 'Site' })
    const id = source.deliverables[0]!.id
    const store = { storeVersion: 1, projects: [source, target] }
    const moved = moveDeliverable(store, { fromProjectId: 'p1', deliverableId: id, toProjectId: 'p2' }, '2026-08-26T09:00:00.000Z')
    expect(moved.projects[0]!.deliverables).toEqual([])
    expect(moved.projects[1]!.deliverables).toEqual([{ id, title: 'Copy edit', owner: 'Ana', dueAt: '2026-09-01', doneAt: null }])
    expect(moved.projects[1]!.updatedAt).toBe('2026-08-26T09:00:00.000Z')
    // Nothing to move, or nowhere to move it: the store is untouched.
    expect(moveDeliverable(store, { fromProjectId: 'p1', deliverableId: 'nope', toProjectId: 'p2' }, NOW)).toBe(store)
    expect(moveDeliverable(store, { fromProjectId: 'p1', deliverableId: id, toProjectId: 'p9' }, NOW)).toBe(store)
    expect(moveDeliverable(store, { fromProjectId: 'p1', deliverableId: id, toProjectId: 'p1' }, NOW)).toBe(store)
  })
})

describe('waiting on someone', () => {
  const ask = (name: string, what: string, at = '2026-08-21') => ({
    person: name,
    what,
    askedAt: at,
  })

  it('is the status and the record together, never one without the other', () => {
    const waiting = addWaitingOn(project(), ask('Mathias', 'first sketches'), NOW)
    expect(waiting.status).toBe('waiting')
    expect(waiting.waitingOn.map(w => w.person)).toEqual(['Mathias'])
  })

  it('holds several waits at once, oldest first', () => {
    let p = addWaitingOn(project(), ask('Mathias', 'sketches', '2026-08-18'), NOW)
    p = addWaitingOn(p, ask('Vincent', 'the funder list', '2026-08-20'), NOW)
    p = addWaitingOn(p, ask('Lena', 'the contract', '2026-08-21'), NOW)
    expect(p.waitingOn.map(w => w.person)).toEqual(['Mathias', 'Vincent', 'Lena'])
    expect(new Set(p.waitingOn.map(w => w.id)).size).toBe(3)
    expect(p.status).toBe('waiting')
  })

  it('stays waiting until the LAST one clears', () => {
    let p = addWaitingOn(project(), ask('Mathias', 'sketches'), NOW)
    p = addWaitingOn(p, ask('Vincent', 'the funder list'), NOW)
    const first = p.waitingOn[0]!.id

    p = resolveWaitingOn(p, first, NOW)
    expect(p.status).toBe('waiting')
    expect(p.waitingOn.map(w => w.person)).toEqual(['Vincent'])

    p = resolveWaitingOn(p, p.waitingOn[0]!.id, NOW)
    expect(p.waitingOn).toEqual([])
    expect(p.status).toBe('active')
  })

  it('clears every wait when no id is named', () => {
    let p = addWaitingOn(project(), ask('Mathias', 'sketches'), NOW)
    p = addWaitingOn(p, ask('Vincent', 'the funder list'), NOW)
    const cleared = resolveWaitingOn(p, null, NOW)
    expect(cleared.waitingOn).toEqual([])
    expect(cleared.status).toBe('active')
  })

  it('ignores an unknown id rather than clearing something else', () => {
    const p = addWaitingOn(project(), ask('Mathias', 'sketches'), NOW)
    expect(resolveWaitingOn(p, 'wait_nope', NOW).waitingOn).toHaveLength(1)
  })

  it('leaves a done project done when a wait is cleared', () => {
    const done = project({ status: 'done' })
    expect(resolveWaitingOn(done, null, NOW).status).toBe('done')
  })

  it('summarises a stack for a one-line row', () => {
    let p = addWaitingOn(project(), ask('Mathias', 'sketches'), NOW)
    expect(waitingSummary(p)).toBe('Mathias — sketches')
    p = addWaitingOn(p, ask('Vincent', 'the funder list'), NOW)
    expect(waitingSummary(p)).toBe('Mathias — sketches +1 more')
    expect(waitingSummary(project())).toBe('')
  })
})

describe('reading a store written before waits could stack', () => {
  it('migrates a single waitingOn object into a list, keeping its date', () => {
    const store = parseStore({
      storeVersion: 1,
      projects: [
        {
          id: 'p1',
          name: 'Legacy',
          status: 'waiting',
          waitingOn: { person: 'Vincent', what: 'the funder list', askedAt: '2026-08-01' },
        },
      ],
    })
    const waits = store.projects[0]!.waitingOn
    expect(waits).toHaveLength(1)
    expect(waits[0]).toMatchObject({
      person: 'Vincent',
      what: 'the funder list',
      askedAt: '2026-08-01',
    })
    expect(waits[0]!.id).toBeTruthy()
  })

  it('reads null as no waits, and drops a nameless entry', () => {
    const store = parseStore({
      storeVersion: 1,
      projects: [
        { id: 'p1', name: 'A', status: 'active', waitingOn: null },
        { id: 'p2', name: 'B', status: 'waiting', waitingOn: { person: '  ', what: 'x' } },
      ],
    })
    expect(store.projects[0]!.waitingOn).toEqual([])
    expect(store.projects[1]!.waitingOn).toEqual([])
  })
})

describe('overdue is derived, never stored', () => {
  it('reads from the due date against today', () => {
    expect(isOverdue(project({ dueAt: '2026-08-20' }), TODAY)).toBe(true)
    expect(isOverdue(project({ dueAt: '2026-09-20' }), TODAY)).toBe(false)
    expect(isOverdue(project({ dueAt: '' }), TODAY)).toBe(false)
  })

  it('stops being overdue the moment the date moves', () => {
    const late = project({ dueAt: '2026-08-20' })
    expect(isOverdue(late, TODAY)).toBe(true)
    expect(isOverdue({ ...late, dueAt: '2026-09-30' }, TODAY)).toBe(false)
  })

  it('never calls a finished project overdue', () => {
    expect(isOverdue(project({ dueAt: '2026-08-01', status: 'done' }), TODAY)).toBe(false)
  })

  it('counts whole days in each direction', () => {
    expect(daysUntil('2026-08-25', TODAY)).toBe(0)
    expect(daysUntil('2026-08-29', TODAY)).toBe(4)
    expect(daysUntil('2026-08-23', TODAY)).toBe(-2)
    expect(daysUntil('', TODAY)).toBeNull()
    expect(daysUntil('not a date', TODAY)).toBeNull()
  })
})

describe('a project with no next action', () => {
  it('is flagged while open and ignored once done', () => {
    expect(hasNoNextAction(project({ nextAction: '' }))).toBe(true)
    expect(hasNoNextAction(project({ nextAction: '   ' }))).toBe(true)
    expect(hasNoNextAction(project({ nextAction: 'Draft the outline' }))).toBe(false)
    expect(hasNoNextAction(project({ nextAction: '', status: 'done' }))).toBe(false)
  })
})

describe('deliverables', () => {
  it('adds, completes and reopens', () => {
    const withOne = addDeliverable(project(), { title: 'Copy edit', owner: 'Mathias' }, NOW)
    const id = withOne.deliverables[0]!.id
    expect(withOne.deliverables[0]?.doneAt).toBeNull()

    const completed = updateDeliverable(withOne, id, { done: true }, NOW)
    expect(completed.deliverables[0]?.doneAt).toBe(NOW)

    const reopened = updateDeliverable(completed, id, { done: false }, NOW)
    expect(reopened.deliverables[0]?.doneAt).toBeNull()
  })

  it('leaves other deliverables untouched', () => {
    let current = addDeliverable(project(), { title: 'One' }, NOW)
    current = addDeliverable(current, { title: 'Two' }, NOW)
    const first = current.deliverables[0]!.id
    const after = updateDeliverable(current, first, { done: true }, NOW)
    expect(after.deliverables[1]?.doneAt).toBeNull()
    expect(after.deliverables[1]?.title).toBe('Two')
  })
})

describe('journal', () => {
  it('is append-only and newest first', () => {
    const one = logJournalEntry(project(), { title: 'Cut the tooling chapter' }, NOW)
    const two = logJournalEntry(one, { title: 'Mathias on illustrations' }, NOW)
    expect(two.journal).toHaveLength(2)
    expect(two.journal[0]?.title).toBe('Mathias on illustrations')
    expect(two.journal[1]?.title).toBe('Cut the tooling chapter')
  })
})

describe('links', () => {
  it('does not link the same path twice', () => {
    const once = linkDocument(project(), { label: 'The book', path: '/Pure/a.book' }, NOW)
    const twice = linkDocument(once, { label: 'Again', path: '/Pure/a.book' }, NOW)
    expect(twice.links).toHaveLength(1)
  })
})

describe('summary and sorting', () => {
  const projects = [
    project({ id: 'a', name: 'Overdue', dueAt: '2026-08-20', nextAction: 'Chase' }),
    project({ id: 'b', name: 'Soon', dueAt: '2026-08-29', nextAction: 'Write' }),
    project({ id: 'c', name: 'Undated', dueAt: '', nextAction: '' }),
    project({ id: 'd', name: 'Closed', dueAt: '2026-08-01', status: 'done' }),
  ]

  it('counts what needs attention', () => {
    const summary = summarize(projects, TODAY)
    expect(summary.total).toBe(4)
    expect(summary.overdue).toBe(1)
    expect(summary.noNextAction).toBe(1)
    expect(summary.dueThisWeek).toBe(1)
    expect(summary.byStatus.done).toBe(1)
  })

  it('puts what needs attention first and sinks closed work', () => {
    const order = sortForList(projects, TODAY).map(item => item.name)
    expect(order).toEqual(['Overdue', 'Soon', 'Undated', 'Closed'])
  })
})

describe('parseStore', () => {
  it('returns an empty store for junk rather than throwing', () => {
    expect(parseStore(null).projects).toEqual([])
    expect(parseStore({ projects: 'nope' }).projects).toEqual([])
  })

  it('drops a malformed project and keeps the rest', () => {
    const parsed = parseStore({
      projects: [{ id: 'a', name: 'Real' }, { id: 'b' }, null],
    })
    expect(parsed.projects.map(item => item.name)).toEqual(['Real'])
  })

  it('defaults missing collections so the app never reads undefined', () => {
    const parsed = parseStore({ projects: [{ id: 'a', name: 'Sparse' }] })
    const only = parsed.projects[0]!
    expect(only.deliverables).toEqual([])
    expect(only.journal).toEqual([])
    expect(only.links).toEqual([])
    expect(only.people).toEqual([])
    expect(only.status).toBe('active')
  })
})

describe('manual-only edits', () => {
  it('edits and removes journal entries', () => {
    const one = logJournalEntry(project(), { title: 'Typo here', body: 'Body' }, NOW)
    const id = one.journal[0]!.id
    const fixed = editJournalEntry(one, id, { title: 'Fixed' }, NOW)
    expect(fixed.journal[0]?.title).toBe('Fixed')
    expect(fixed.journal[0]?.body).toBe('Body')
    expect(removeJournalEntry(fixed, id, NOW).journal).toHaveLength(0)
  })

  it('removes deliverables and links, and is a no-op for unknown ids', () => {
    const withOne = addDeliverable(project(), { title: 'Copy edit' }, NOW)
    const id = withOne.deliverables[0]!.id
    expect(removeDeliverable(withOne, id, NOW).deliverables).toHaveLength(0)
    expect(removeDeliverable(withOne, 'nope', NOW)).toBe(withOne)

    const linked = linkDocument(project(), { label: 'Doc', path: '/a' }, NOW)
    expect(removeLink(linked, linked.links[0]!.id, NOW).links).toHaveLength(0)
    expect(removeLink(linked, 'nope', NOW)).toBe(linked)
  })

})

describe('repointLinks', () => {
  it('follows a moved package in every project that links it', () => {
    const a = linkDocument(project({ id: 'a' }), { label: 'Old', path: '/x/Old.document' }, NOW)
    const b = linkDocument(project({ id: 'b' }), { label: 'Old', path: '/x/Old.document' }, NOW)
    const c = linkDocument(project({ id: 'c' }), { label: 'Other', path: '/x/Other.book' }, NOW)

    const moved = repointLinks(
      [a, b, c],
      '/x/Old.document',
      { path: '/x/New.document', label: 'New' },
      NOW,
    )
    expect(moved[0]?.links[0]?.path).toBe('/x/New.document')
    expect(moved[0]?.links[0]?.label).toBe('New')
    expect(moved[1]?.links[0]?.path).toBe('/x/New.document')
    // Untouched projects keep their identity, so React does not re-render them.
    expect(moved[2]).toBe(c)
  })
})

describe('renameLinkLabel', () => {
  it('changes the label without touching the path', () => {
    const withLink = linkDocument(project(), { label: 'Old', path: '/x/a.book' }, NOW)
    const id = withLink.links[0]!.id
    const renamed = renameLinkLabel(withLink, id, 'Better name', NOW)
    expect(renamed.links[0]?.label).toBe('Better name')
    expect(renamed.links[0]?.path).toBe('/x/a.book')
  })
})

describe('waitingLines', () => {
  function waiting(project: Project, people: string[]): Project {
    return people.reduce(
      (current, person, index) =>
        addWaitingOn(current, { person, what: `thing ${index + 1}`, askedAt: '2026-08-20' }, NOW),
      project,
    )
  }

  it('gives one line per wait so two waits read as two facts', () => {
    const { lines, overflow } = waitingLines(waiting(project(), ['Leon', 'Todd']))
    expect(lines).toEqual(['Leon — thing 1', 'Todd — thing 2'])
    expect(overflow).toBe(0)
  })

  it('counts the ones it does not show rather than dropping them', () => {
    const { lines, overflow } = waitingLines(
      waiting(project(), ['Leon', 'Todd', 'Vincent', 'Mathias']),
    )
    expect(lines).toHaveLength(2)
    expect(overflow).toBe(2)
  })

  it('omits the dash when nothing was asked for', () => {
    const one = addWaitingOn(project(), { person: 'Leon', what: '', askedAt: '2026-08-20' }, NOW)
    expect(waitingLines(one).lines).toEqual(['Leon'])
  })
})

describe('promoting a deliverable to the next action', () => {
  const withTwo = () => {
    let current = addDeliverable(project(), { title: 'Send the trust deed' }, NOW)
    current = addDeliverable(current, { title: 'Send the tax return' }, NOW)
    return current
  }

  it('names the deliverable rather than asking you to retype it', () => {
    const current = withTwo()
    const promoted = setNextActionFromDeliverable(current, current.deliverables[0].id, NOW)
    expect(promoted.nextAction).toBe('Send the trust deed')
    expect(nextDeliverable(promoted)?.id).toBe(current.deliverables[0].id)
  })

  it('refuses a finished deliverable — history is never next', () => {
    let current = withTwo()
    const id = current.deliverables[0].id
    current = updateDeliverable(current, id, { done: true }, NOW)
    expect(setNextActionFromDeliverable(current, id, NOW).nextAction).toBe('')
  })

  it('renames the next action with the deliverable it names', () => {
    let current = withTwo()
    const id = current.deliverables[0].id
    current = setNextActionFromDeliverable(current, id, NOW)
    current = updateDeliverable(current, id, { title: 'Send the deed and variations' }, NOW)
    expect(current.nextAction).toBe('Send the deed and variations')
  })

  it('empties the bar when the deliverable it names is ticked off', () => {
    let current = withTwo()
    const id = current.deliverables[0].id
    current = setNextActionFromDeliverable(current, id, NOW)
    current = updateDeliverable(current, id, { done: true }, NOW)
    expect(current.nextAction).toBe('')
  })

  it('leaves the next action alone when a different deliverable changes', () => {
    let current = withTwo()
    current = setNextActionFromDeliverable(current, current.deliverables[0].id, NOW)
    current = updateDeliverable(current, current.deliverables[1].id, { done: true }, NOW)
    expect(current.nextAction).toBe('Send the trust deed')
  })

  it('clears the next action when its deliverable is removed', () => {
    let current = withTwo()
    const id = current.deliverables[0].id
    current = setNextActionFromDeliverable(current, id, NOW)
    current = removeDeliverable(current, id, NOW)
    expect(current.nextAction).toBe('')
  })
})

describe('archiving a project', () => {
  const LATER = '2026-08-25T10:00:00.000Z'

  it('keeps every bit of the record', () => {
    let current = addDeliverable(project(), { title: 'Send the deed' }, NOW)
    current = addWaitingOn(current, { person: 'Amy', what: 'a reply', askedAt: '2026-08-20' }, NOW)
    current = logJournalEntry(current, { title: 'Agreed the scope' }, NOW)
    const archived = archiveProject(current, LATER)
    expect(archived.deliverables).toEqual(current.deliverables)
    expect(archived.waitingOn).toEqual(current.waitingOn)
    expect(archived.journal).toEqual(current.journal)
    expect(archived.nextAction).toBe(current.nextAction)
  })

  it('leaves the status alone, so it still says where the work stood', () => {
    // Not a fifth status: something abandoned mid-flight is archived AND
    // waiting, and folding those together would lose the second fact.
    const waiting = addWaitingOn(project(), { person: 'Amy', what: 'a reply', askedAt: '2026-08-20' }, NOW)
    const archived = archiveProject(waiting, LATER)
    expect(archived.status).toBe(waiting.status)
    expect(isArchived(archived)).toBe(true)
  })

  it('comes back standing exactly where it stood', () => {
    const before = addWaitingOn(project(), { person: 'Amy', what: 'a reply', askedAt: '2026-08-20' }, NOW)
    const restored = restoreProject(archiveProject(before, LATER), LATER)
    expect(restored.archivedAt).toBeNull()
    expect(restored.status).toBe(before.status)
    expect(restored.waitingOn).toEqual(before.waitingOn)
  })

  it('archiving twice does not move the date', () => {
    const once = archiveProject(project(), LATER)
    expect(archiveProject(once, '2026-09-01T00:00:00.000Z').archivedAt).toBe(LATER)
  })

  it('splits the lists so no view can forget the rule', () => {
    const live = { ...project(), id: 'a' }
    const filed = archiveProject({ ...project(), id: 'b' }, LATER)
    expect(livingProjects([live, filed]).map(p => p.id)).toEqual(['a'])
    expect(archivedProjects([live, filed]).map(p => p.id)).toEqual(['b'])
  })

  it('is not counted in the summary it left', () => {
    const overdue = { ...project(), id: 'a', dueAt: '2026-08-01', status: 'active' as const }
    const now = new Date(NOW)
    expect(summarize([overdue], now).overdue).toBe(1)
    expect(summarize(livingProjects([archiveProject(overdue, LATER)]), now).overdue).toBe(0)
  })

  it('survives a round trip through the store', () => {
    const filed = archiveProject(project(), LATER)
    const parsed = parseStore({ storeVersion: 1, projects: [filed] })
    expect(parsed.projects[0].archivedAt).toBe(LATER)
  })

  it('reads a store written before archiving existed', () => {
    const legacy = { ...project() } as Record<string, unknown>
    delete legacy.archivedAt
    const parsed = parseStore({ storeVersion: 1, projects: [legacy] })
    expect(parsed.projects[0].archivedAt).toBeNull()
    expect(isArchived(parsed.projects[0])).toBe(false)
  })
})

describe('the waiting count', () => {
  it('counts projects that are actually waiting, not every project', () => {
    const idle = { ...project(), id: 'a' }
    const held = addWaitingOn({ ...project(), id: 'b' }, { person: 'Amy', what: 'a reply', askedAt: '2026-08-20' }, NOW)
    expect(summarize([idle, held], new Date(NOW)).waiting).toBe(1)
  })
})

describe('arranging the list by hand', () => {
  const at = (id: string, patch: Partial<Project> = {}) => ({
    ...project(),
    id,
    name: id,
    ...patch,
  })
  const ids = (list: Project[]) => list.map(item => item.id)
  const NOW_DATE = new Date(NOW)

  it('leaves the urgency sort alone until something is dragged', () => {
    const soon = at('soon', { dueAt: '2026-08-26' })
    const later = at('later', { dueAt: '2026-12-01' })
    expect(hasManualOrder([soon, later])).toBe(false)
    expect(ids(sortForDisplay([later, soon], NOW_DATE))).toEqual(['soon', 'later'])
  })

  it('lets the arrangement beat the urgency sort once there is one', () => {
    // Otherwise the list quietly re-sorts and the drag was a lie.
    const soon = at('soon', { dueAt: '2026-08-26', order: 1 })
    const later = at('later', { dueAt: '2026-12-01', order: 0 })
    expect(ids(sortForDisplay([soon, later], NOW_DATE))).toEqual(['later', 'soon'])
  })

  it('keeps a project made after the arrangement in sight, not at the bottom', () => {
    const placed = at('placed', { order: 0 })
    const fresh = at('fresh')
    expect(ids(sortForDisplay([placed, fresh], NOW_DATE))).toEqual(['fresh', 'placed'])
  })

  it('numbers the whole sequence, not just what moved', () => {
    // A partial order is how two projects claim one position and the list
    // jitters on every render.
    const list = [at('a'), at('b'), at('c')]
    const ordered = applyManualOrder(list, ['c', 'a', 'b'], NOW)
    expect(ordered.map(item => [item.id, item.order])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 0],
    ])
  })

  it('touches only the projects whose position actually changed', () => {
    const list = [at('a', { order: 0 }), at('b', { order: 1 })]
    const ordered = applyManualOrder(list, ['a', 'b'], '2026-09-09T00:00:00.000Z')
    expect(ordered[0]).toBe(list[0])
    expect(ordered[1]).toBe(list[1])
  })

  it('drops before and after the row you aimed at', () => {
    const list = [at('a'), at('b'), at('c')]
    expect(sequenceAfterMove(list, 'c', 'a', 'before')).toEqual(['c', 'a', 'b'])
    expect(sequenceAfterMove(list, 'a', 'c', 'after')).toEqual(['b', 'c', 'a'])
    expect(sequenceAfterMove(list, 'a', 'b', 'before')).toEqual(['a', 'b', 'c'])
  })

  it('is a no-op when dropped on itself or on nothing', () => {
    const list = [at('a'), at('b')]
    expect(sequenceAfterMove(list, 'a', 'a', 'after')).toEqual(['a', 'b'])
    expect(sequenceAfterMove(list, 'a', 'ghost', 'after')).toEqual(['a', 'b'])
  })

  it('reads a store written before the list could be arranged', () => {
    const legacy = { ...project() } as Record<string, unknown>
    delete legacy.order
    expect(parseStore({ storeVersion: 1, projects: [legacy] }).projects[0].order).toBeNull()
  })
})

describe('searching a project', () => {
  it('finds a document by name, which the box has always promised', () => {
    const withDoc = linkDocument(
      project(),
      { label: 'BNZ and Property', path: '/Pure/BNZ and Property.document', kind: 'document' },
      NOW,
    )
    expect(matchesQuery(withDoc, 'bnz')).toBe(true)
    expect(matchesQuery(project(), 'bnz')).toBe(false)
  })

  it('finds a deliverable, and who owns it', () => {
    const withWork = addDeliverable(project(), { title: 'Send the deed', owner: 'Amy' }, NOW)
    expect(matchesQuery(withWork, 'deed')).toBe(true)
    expect(matchesQuery(withWork, 'amy')).toBe(true)
  })

  it('finds what someone is being waited on for', () => {
    const held = addWaitingOn(
      project(),
      { person: 'Leon', what: 'the signed contract', askedAt: '2026-08-20' },
      NOW,
    )
    expect(matchesQuery(held, 'signed contract')).toBe(true)
    expect(matchesQuery(held, 'leon')).toBe(true)
  })

  it('finds something written in the journal', () => {
    const logged = logJournalEntry(project(), { title: 'Scope agreed', body: 'Two workshops' }, NOW)
    expect(matchesQuery(logged, 'two workshops')).toBe(true)
  })
})

describe('sorting the list', () => {
  const at = (id: string, patch: Partial<Project> = {}) => ({
    ...project(),
    id,
    name: id,
    ...patch,
  })
  const ids = (list: Project[]) => list.map(item => item.id)
  const NOW_DATE = new Date(NOW)

  it('puts the undated last by due date, not first', () => {
    // No date is the absence of a deadline, not the most distant one.
    const list = [at('none'), at('late', { dueAt: '2026-12-01' }), at('soon', { dueAt: '2026-08-26' })]
    expect(ids(sortProjects(list, 'due', NOW_DATE))).toEqual(['soon', 'late', 'none'])
  })

  it('sorts by name and by what changed last', () => {
    const list = [
      at('beta', { updatedAt: '2026-08-01T00:00:00.000Z' }),
      at('alpha', { updatedAt: '2026-08-20T00:00:00.000Z' }),
    ]
    expect(ids(sortProjects(list, 'name', NOW_DATE))).toEqual(['alpha', 'beta'])
    expect(ids(sortProjects(list, 'updated', NOW_DATE))).toEqual(['alpha', 'beta'])
  })

  it('urgency still leads with what is overdue', () => {
    const list = [at('later', { dueAt: '2026-12-01' }), at('overdue', { dueAt: '2026-08-01' })]
    expect(ids(sortProjects(list, 'urgency', NOW_DATE))[0]).toBe('overdue')
  })

  it('my order falls back to urgency until something is arranged', () => {
    const list = [at('later', { dueAt: '2026-12-01' }), at('overdue', { dueAt: '2026-08-01' })]
    expect(ids(sortProjects(list, 'manual', NOW_DATE))).toEqual(
      ids(sortProjects(list, 'urgency', NOW_DATE)),
    )
  })
})
