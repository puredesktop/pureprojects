// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject } from '../lib/projectModel'
import type { Project } from '../types'
import { MiniProjects, type MiniProjectsProps } from './MiniProjects'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const NOW = new Date('2026-11-02T12:00:00Z')
const AT = '2026-10-01T00:00:00Z'
const project = (name: string, patch: Partial<Project> = {}): Project => ({ ...createProject({ name }, AT), id: name, nextAction: 'Do it', ...patch })

let root: Root, host: HTMLDivElement
let calls: Record<string, ReturnType<typeof vi.fn>>
const late = project('Late one', { dueAt: '2026-10-30', nextAction: 'Ring the printer', waitingOn: [{ id: 'w1', person: 'Vincent', what: 'the list', askedAt: '2026-10-20' }], deliverables: [{ id: 'd1', title: 'Proofs', owner: '', dueAt: '', doneAt: null }, { id: 'd2', title: 'Old', owner: '', dueAt: '', doneAt: AT }] })
const calm = project('Calm one')

function Harness({ projects }: { projects: Project[] }) {
  const [id, setId] = useState<string | null>(null)
  const props: MiniProjectsProps = {
    projects, selected: projects.find(p => p.id === id) ?? null, now: NOW, notice: null, onSelect: setId,
    onNewProject: calls.onNewProject as never, onSetNextAction: calls.onSetNextAction as never, onCompleteNextAction: calls.onCompleteNextAction as never,
    onToggleDeliverable: calls.onToggleDeliverable as never, onAddDeliverable: calls.onAddDeliverable as never, onAddWaitingOn: calls.onAddWaitingOn as never,
    onResolveWaitingOn: calls.onResolveWaitingOn as never, onAddJournalEntry: calls.onAddJournalEntry as never,
  }
  return <MiniProjects {...props} />
}
const render = (projects: Project[]) => act(async () => root.render(<Harness projects={projects} />))
const labelled = (name: string) => host.querySelector<HTMLElement>(`[aria-label="${name}"]`)!
const type = async (name: string, value: string) => {
  const input = labelled(name) as HTMLInputElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
}
const click = (el: HTMLElement) => act(async () => { el.click() })

beforeEach(() => {
  calls = Object.fromEntries(['onNewProject', 'onSetNextAction', 'onCompleteNextAction', 'onToggleDeliverable', 'onAddDeliverable', 'onAddWaitingOn', 'onResolveWaitingOn', 'onAddJournalEntry'].map(n => [n, vi.fn()]))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('held in a page', () => {
  it('puts whichever needs you first in front, with its next step, its waits and what is left', async () => {
    await render([calm, late])
    expect(host.querySelector('h2')!.textContent).toBe('Late one')
    expect((labelled('The next step') as HTMLInputElement).value).toBe('Ring the printer')
    expect(host.textContent).toContain('Vincent')
    expect(host.textContent).toContain('Proofs')
    expect(host.textContent).not.toContain('Old')
    expect(host.querySelector('header')!.textContent).toContain('1 late')
  })

  it('does each thing with one press, on the project in front', async () => {
    await render([calm, late])
    await click(labelled('It is done'))
    expect(calls.onCompleteNextAction).toHaveBeenCalled()
    await click(labelled('Vincent has come through'))
    expect(calls.onResolveWaitingOn).toHaveBeenCalledWith('w1')
    await click(labelled('Done: Proofs'))
    expect(calls.onToggleDeliverable).toHaveBeenCalledWith(late.deliverables[0])
  })

  it('takes a line to add, and reads who and what from one line', async () => {
    await render([late])
    await type('Add something to do', 'Book the room')
    expect(calls.onAddDeliverable).toHaveBeenCalledWith({ title: 'Book the room' })
    await type('Waiting on someone', 'Ana, the signed contract')
    expect(calls.onAddWaitingOn).toHaveBeenCalledWith({ person: 'Ana', what: 'the signed contract' })
    await type('Waiting on someone', 'Bo')
    expect(calls.onAddWaitingOn).toHaveBeenCalledWith({ person: 'Bo', what: '' })
    await type('Note it in the journal', 'We chose the second printer')
    expect(calls.onAddJournalEntry).toHaveBeenCalledWith({ title: 'We chose the second printer', body: '' })
  })

  it('keeps a next step typed and not yet entered when the project goes out of view', async () => {
    await render([calm, late])
    const input = labelled('The next step') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Ring the other printer')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => root.render(null))
    expect(calls.onSetNextAction).toHaveBeenCalledWith('Ring the other printer')
  })

  it('offers to start a project when there are none open', async () => {
    await render([project('Over', { status: 'done' })])
    expect(host.textContent).toContain('No open projects')
    await click([...host.querySelectorAll('button')].find(b => b.textContent === 'New project') as HTMLElement)
    expect(calls.onNewProject).toHaveBeenCalled()
  })
})
