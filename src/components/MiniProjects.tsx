import { Check, Plus } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import { needsYouFirst, standing } from '../lib/miniProjects'
import { hasNoNextAction, isOverdue } from '../lib/projectModel'
import type { Deliverable, Project } from '../types'
import { shortDate } from './ProjectsList'

/**
 * PureProjects held in a page, beside a conversation: the open projects with whichever needs you first on top, and for the
 * one in front the things a conversation changes: its next step, who you are waiting on, what is left to do, and a line
 * for its journal. Everything goes through the app's own changes. Documents, the journal's history and the arranging are
 * in the full app, which comes back on the same project.
 */

const Sheet = styled.div`display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--p-sheet); color: var(--p-ink); font-size: 13px;`
const Top = styled.header`
  flex: none; display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--p-line);
  h1 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -0.005em; }
  p { margin: 0; flex: 1; min-width: 0; font-size: 12px; color: var(--p-soft); font-variant-numeric: tabular-nums lining-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  p b { font-weight: 650; color: var(--p-bad); }
`
const Quiet = styled.button`
  all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; flex: none; height: 26px; padding: 0 9px; border-radius: 3px; font-size: 12.5px; font-weight: 600; color: var(--p-ink); box-shadow: inset 0 0 0 1px var(--p-line);
  svg { width: 14px; height: 14px; }
  &:hover { background: var(--p-hover); } &:focus-visible { outline: 2px solid var(--p-accent); outline-offset: 1px; }
`
const Work = styled.div`flex: 1; min-height: 0; display: grid; grid-template-columns: 272px minmax(0, 1fr);`
const List = styled.ul`margin: 0; padding: 0; list-style: none; min-height: 0; overflow: auto; border-right: 1px solid var(--p-line);`
const Row = styled.li<{ $on: boolean }>`
  > button {
    all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; flex-direction: column; gap: 1px; padding: 8px 12px 8px 10px;
    background: ${p => (p.$on ? 'var(--p-chosen, var(--p-accent-tint))' : 'transparent')};
    box-shadow: ${p => (p.$on ? 'var(--p-chosen-edge, inset 0 -1px 0 var(--p-rule))' : 'inset 0 -1px 0 var(--p-rule)')};
  }
  > button:hover { background: ${p => (p.$on ? 'var(--p-chosen, var(--p-accent-tint))' : 'var(--p-hover)')}; }
  > button:focus-visible { outline: 2px solid var(--p-accent); outline-offset: -2px; }
  .name { font-size: 13px; font-weight: 600; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .next { font-size: 12px; line-height: 1.3; color: var(--p-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stand { font-size: 11.5px; line-height: 1.3; font-weight: 500; color: var(--p-faint); }
  .stand.bad { color: var(--p-bad); font-weight: 600; } .stand.warn { color: var(--p-warn); font-weight: 600; }
`
const Page = styled.section`min-height: 0; overflow: auto; padding: 14px 18px 18px; display: flex; flex-direction: column; gap: 14px;`
const Name = styled.div`
  h2 { margin: 0; font-size: 19px; font-weight: 650; letter-spacing: -0.012em; line-height: 1.2; overflow-wrap: anywhere; }
  p { margin: 2px 0 0; font-size: 12.5px; line-height: 1.4; color: var(--p-soft); }
  p .late { color: var(--p-bad); font-weight: 600; }
`
const Label = styled.h3`margin: 0 0 4px; font-size: 11.5px; font-weight: 600; color: var(--p-soft); font-variant-numeric: tabular-nums lining-nums; span { color: var(--p-faint); font-weight: 500; }`
const Next = styled.form`
  display: flex; align-items: center; gap: 8px; border-block: 1px solid var(--p-line); padding: 6px 0;
  input { flex: 1; min-width: 0; border: 0; background: transparent; font: inherit; font-size: 15px; font-weight: 600; color: var(--p-ink); padding: 4px 0; outline: none; }
  input::placeholder { color: var(--p-warn); font-weight: 500; }
`
const Tick = styled.button<{ $done?: boolean }>`
  all: unset; cursor: pointer; flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 3px;
  color: ${p => (p.$done ? '#fff' : 'var(--p-ok)')}; background: ${p => (p.$done ? 'var(--p-ok)' : 'transparent')}; box-shadow: inset 0 0 0 1px ${p => (p.$done ? 'var(--p-ok)' : 'color-mix(in srgb, var(--p-ok) 45%, transparent)')};
  svg { width: 14px; height: 14px; }
  &:hover { background: ${p => (p.$done ? 'var(--p-ok)' : 'var(--p-ok-tint)')}; } &:focus-visible { outline: 2px solid var(--p-accent); outline-offset: 1px; }
`
const Items = styled.ul`margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column;`
const Item = styled.li`
  display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 4px 0; font-size: 13.5px; line-height: 1.35;
  .what { overflow-wrap: anywhere; min-width: 0; } .what small { color: var(--p-soft); font-size: 12.5px; }
  .when { font-size: 12px; color: var(--p-faint); white-space: nowrap; font-variant-numeric: tabular-nums lining-nums; }
`
const Add = styled.form`
  display: flex; align-items: center; gap: 8px; padding-top: 3px;
  svg { width: 14px; height: 14px; color: var(--p-faint); flex: none; margin-inline: 4px; }
  input { flex: 1; min-width: 0; border: 0; background: transparent; font: inherit; font-size: 13px; color: var(--p-ink); padding: 3px 0; outline: none; }
  input::placeholder { color: var(--p-faint); }
`
const Empty = styled.div`
  flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 10px; padding: 24px 30px;
  h2 { margin: 0; font-size: 19px; font-weight: 650; } p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--p-soft); max-width: 46ch; }
`

export interface MiniProjectsProps {
  projects: Project[]
  selected: Project | null
  now: Date
  notice: string | null
  onSelect: (projectId: string) => void
  onNewProject: () => void
  onSetNextAction: (text: string) => void
  onCompleteNextAction: () => void
  onToggleDeliverable: (deliverable: Deliverable) => void
  onAddDeliverable: (input: { title: string }) => void
  onAddWaitingOn: (input: { person: string; what: string }) => void
  onResolveWaitingOn: (waitingId: string) => void
  onAddJournalEntry: (entry: { title: string; body: string }) => void
}

/** One line, kept when Enter is pressed. */
function OneLine({ label, placeholder, onSubmit, icon = true }: { label: string; placeholder: string; onSubmit: (text: string) => void; icon?: boolean }): React.ReactElement {
  const [text, setText] = useState('')
  return (
    <Add onSubmit={event => { event.preventDefault(); const words = text.trim(); if (words) { onSubmit(words); setText('') } }}>
      {icon ? <Plus aria-hidden /> : null}
      <input aria-label={label} placeholder={placeholder} value={text} onChange={event => setText(event.target.value)} />
    </Add>
  )
}

/** "Vincent: the funder list" comes in as who and what. */
const readWait = (words: string): { person: string; what: string } => {
  const at = words.search(/\s*[:,–—-]\s+|\s+for\s+/)
  if (at < 0) return { person: words, what: '' }
  const rest = words.slice(at).replace(/^\s*(?:[:,–—-]|for)\s+/, '')
  return { person: words.slice(0, at), what: rest }
}

function NextStep({ project, onSet, onDone }: { project: Project; onSet: (text: string) => void; onDone: () => void }): React.ReactElement {
  const [text, setText] = useState(project.nextAction)
  useEffect(() => setText(project.nextAction), [project.nextAction])
  // what is typed is kept however it goes: another project, or Full app
  const latest = useRef({ text, saved: project.nextAction, onSet })
  latest.current = { text, saved: project.nextAction, onSet }
  const keep = (): void => { const { text: t, saved, onSet: set } = latest.current; if (t.trim() !== saved.trim()) set(t.trim()) }
  useEffect(() => keep, []) // eslint-disable-line react-hooks/exhaustive-deps
  const open = !hasNoNextAction(project) && text.trim() === project.nextAction.trim()
  return (
    <div>
      <Label>The next step</Label>
      <Next onSubmit={event => { event.preventDefault(); keep() }}>
        {open ? <Tick type="button" aria-label="It is done" title="It is done: the project then asks what is next" onClick={onDone}><Check /></Tick> : null}
        <input aria-label="The next step" value={text} placeholder="No next step yet. What is it?" onChange={event => setText(event.target.value)} onBlur={keep} />
      </Next>
    </div>
  )
}

export function MiniProjects(props: MiniProjectsProps): React.ReactElement {
  const { projects, selected, now, notice, onSelect, onNewProject } = props
  const shown = useMemo(() => needsYouFirst(projects, now), [projects, now])
  const front = selected && shown.some(project => project.id === selected.id) ? selected : shown[0] ?? null
  const frontId = front?.id ?? null
  // whoever stands in front is the project the actions below act on, and the one the full app opens
  useEffect(() => { if (frontId && frontId !== selected?.id) onSelect(frontId) }, [frontId]) // eslint-disable-line react-hooks/exhaustive-deps
  const late = shown.filter(project => isOverdue(project, now)).length
  const unstepped = shown.filter(hasNoNextAction).length
  const waiting = shown.filter(project => project.waitingOn.length).length
  const open = front?.deliverables.filter(item => !item.doneAt) ?? []
  const done = (front?.deliverables.length ?? 0) - open.length
  return (
    <Sheet aria-label="PureProjects, held in this page">
      <Top>
        <h1>Projects</h1>
        <p>{notice ?? <>{shown.length} open{late ? <> · <b>{late} late</b></> : null}{waiting ? ` · ${waiting} waiting` : ''}{unstepped ? ` · ${unstepped} with no next step` : ''}</>}</p>
        <Quiet type="button" onClick={onNewProject}><Plus aria-hidden />New project</Quiet>
      </Top>
      {front ? (
        <Work>
          <List aria-label="Open projects, whichever needs you first on top">
            {shown.map(project => {
              const stand = standing(project, now)
              return (
                <Row key={project.id} $on={project.id === front.id}>
                  <button type="button" aria-current={project.id === front.id} onClick={() => onSelect(project.id)}>
                    <span className="name">{project.name}</span>
                    {project.nextAction.trim() ? <span className="next">{project.nextAction}</span> : null}
                    {stand.words ? <span className={`stand ${stand.tone}`}>{stand.words}</span> : null}
                  </button>
                </Row>
              )
            })}
          </List>
          <Page key={front.id} aria-label={front.name}>
            <Name>
              <h2>{front.name}</h2>
              {front.summary || front.dueAt ? <p>{front.summary}{front.summary && front.dueAt ? ' · ' : ''}{front.dueAt ? <span className={isOverdue(front, now) ? 'late' : ''}>Due {shortDate(front.dueAt)}</span> : null}</p> : null}
            </Name>
            <NextStep project={front} onSet={props.onSetNextAction} onDone={props.onCompleteNextAction} />
            <div>
              <Label>Waiting on{front.waitingOn.length ? <span> · {front.waitingOn.length}</span> : null}</Label>
              <Items>
                {front.waitingOn.map(wait => (
                  <Item key={wait.id}>
                    <Tick type="button" aria-label={`${wait.person} has come through`} title="It came: the wait is over" onClick={() => props.onResolveWaitingOn(wait.id)}><Check /></Tick>
                    <span className="what">{wait.person}{wait.what ? <small> · {wait.what}</small> : null}</span>
                    <span className="when">since {shortDate(wait.askedAt)}</span>
                  </Item>
                ))}
              </Items>
              <OneLine label="Waiting on someone" placeholder="Who, and for what: Vincent, the funder list" onSubmit={words => props.onAddWaitingOn(readWait(words))} />
            </div>
            <div>
              <Label>Still to do{open.length ? <span> · {open.length}</span> : null}{done ? <span> · {done} done</span> : null}</Label>
              <Items>
                {open.map(item => (
                  <Item key={item.id}>
                    <Tick type="button" aria-label={`Done: ${item.title}`} onClick={() => props.onToggleDeliverable(item)}><Check /></Tick>
                    <span className="what">{item.title}{item.owner ? <small> · {item.owner}</small> : null}</span>
                    <span className="when">{item.dueAt ? shortDate(item.dueAt) : ''}</span>
                  </Item>
                ))}
              </Items>
              <OneLine label="Add something to do" placeholder="Add something to do" onSubmit={title => props.onAddDeliverable({ title })} />
            </div>
            <div>
              <Label>For the journal</Label>
              <OneLine label="Note it in the journal" placeholder="What was decided, or what came of this conversation" onSubmit={title => props.onAddJournalEntry({ title, body: '' })} />
            </div>
          </Page>
        </Work>
      ) : (
        <Empty>
          <h2>No open projects</h2>
          <p>A project is a deadline, the people involved and the one next step. Start one, and it stays in view here.</p>
          <Quiet type="button" onClick={onNewProject}><Plus aria-hidden />New project</Quiet>
        </Empty>
      )}
    </Sheet>
  )
}
