import React, { useRef, useState } from 'react'
import {
  Cell,
  DragZone,
  HeaderRow,
  Mono,
  Row,
  RowMeta,
  RowTitle,
  Scroll,
  StatusChip,
  WaitLine,
} from './shellStyles'
import {
  completedCount,
  daysUntil,
  hasNoNextAction,
  isOverdue,
  waitingLines,
} from '../lib/projectModel'
import type { Project } from '../types'

/** "in 4 days" / "2 days ago" — the reading people scan by. */
export function relativeDue(dueAt: string, now: Date): string {
  const days = daysUntil(dueAt, now)
  if (days === null) return 'no date'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days < 0) return `${Math.abs(days)} days ago`
  return `in ${days} days`
}

export function shortDate(dueAt: string): string {
  if (!dueAt) return ''
  const date = new Date(dueAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export interface ProjectsListProps {
  projects: Project[]
  selectedId: string | null
  now: Date
  onSelect: (projectId: string) => void
  /**
   * Absent when the shown list is not the whole list — a filtered or searched
   * view is a question about the projects, and dragging inside the answer
   * cannot express an order for the ones it left out.
   */
  onReorder?: (sourceId: string, targetId: string, place: 'before' | 'after') => void
}

export function ProjectsList({
  projects,
  selectedId,
  now,
  onSelect,
  onReorder,
}: ProjectsListProps): React.ReactElement {
  // The id lives in a ref as well as state: state drives the rendering, but a
  // dragover can arrive before React has applied the dragstart's setState, and
  // then the guard below would read null and ignore the whole drag.
  const draggingRef = useRef<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<{
    id: string
    place: 'before' | 'after'
  } | null>(null)

  const clearDrag = (): void => {
    draggingRef.current = null
    setDragging(null)
    setDropAt(null)
  }

  return (
    <>
      <HeaderRow>
        <div>Project</div>
        <div>Status</div>
        <div>Next action</div>
        <div>People</div>
        <div style={{ textAlign: 'right' }}>Due</div>
      </HeaderRow>
      <Scroll>
        {projects.map(project => {
          const overdue = isOverdue(project, now)
          const done = completedCount(project)
          const total = project.deliverables.length
          const days = daysUntil(project.dueAt, now)
          // Finished work is never urgent: a done project's date is
          // history, not a deadline, so it never takes a warning tone.
          const dueTone =
            project.status === 'done'
              ? 'muted'
              : overdue
                ? 'danger'
                : days !== null && days <= 7
                  ? 'warn'
                  : 'default'
          return (
            <Row
              key={project.id}
              $selected={project.id === selectedId}
              $dragging={dragging === project.id}
              $dropBefore={dropAt?.id === project.id && dropAt.place === 'before'}
              $dropAfter={dropAt?.id === project.id && dropAt.place === 'after'}
              onClick={() => onSelect(project.id)}
              onDragOver={event => {
                const source = draggingRef.current
                if (!onReorder || !source || source === project.id) return
                event.preventDefault()
                // Halfway down the row is the line: above it the dragged row
                // lands before this one, below it after.
                const box = event.currentTarget.getBoundingClientRect()
                const place =
                  event.clientY < box.top + box.height / 2 ? 'before' : 'after'
                setDropAt({ id: project.id, place })
              }}
              onDrop={event => {
                const source = draggingRef.current
                if (!onReorder || !source) return
                event.preventDefault()
                const place = dropAt?.id === project.id ? dropAt.place : 'before'
                if (source !== project.id) onReorder(source, project.id, place)
                clearDrag()
              }}
            >
              {onReorder ? (
                <DragZone
                  draggable
                  aria-hidden="true"
                  onDragStart={event => {
                    event.dataTransfer.effectAllowed = 'move'
                    // Firefox refuses to start a drag with nothing set.
                    event.dataTransfer.setData('text/plain', project.id)
                    draggingRef.current = project.id
                    setDragging(project.id)
                  }}
                  onDragEnd={clearDrag}
                  // A click that never became a drag should still do what
                  // clicking the row does, rather than swallowing it.
                  onClick={() => onSelect(project.id)}
                />
              ) : null}
              <div style={{ minWidth: 0 }}>
                <RowTitle>{project.name}</RowTitle>
                <RowMeta>
                  {project.area ? <span>{project.area}</span> : null}
                  {total > 0 ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {done} of {total} deliverables
                      </span>
                    </>
                  ) : null}
                </RowMeta>
              </div>
              <div>
                <StatusChip $status={project.status} $overdue={overdue}>
                  {overdue ? 'Overdue' : project.status}
                  {/* The count rides the chip: a fixed position that reads
                      at a glance, rather than trailing a wrapped sentence. */}
                  {!overdue && project.waitingOn.length > 1
                    ? ` ×${project.waitingOn.length}`
                    : ''}
                </StatusChip>
              </div>
              {project.waitingOn.length > 0 ? (
                <Cell $tone="warn">
                  {(() => {
                    const { lines, overflow } = waitingLines(project)
                    return (
                      <>
                        {lines.map(line => (
                          <WaitLine key={line}>{line}</WaitLine>
                        ))}
                        {overflow > 0 ? <WaitLine>+{overflow} more</WaitLine> : null}
                      </>
                    )
                  })()}
                </Cell>
              ) : project.status === 'done' ? (
                <Cell $tone="muted">
                  Closed{project.closedAt ? ` ${shortDate(project.closedAt)}` : ''}
                </Cell>
              ) : hasNoNextAction(project) ? (
                <Cell $tone="muted" style={{ fontStyle: 'italic' }}>
                  No next action
                </Cell>
              ) : (
                <Cell $tone={overdue ? 'danger' : 'default'}>
                  {project.nextAction || '—'}
                </Cell>
              )}
              <Cell>{project.people.length ? project.people.join(', ') : 'You'}</Cell>
              <div style={{ textAlign: 'right' }}>
                <Cell $tone={dueTone} style={{ textAlign: 'right' }}>
                  <Mono>{relativeDue(project.dueAt, now)}</Mono>
                </Cell>
                {project.dueAt ? (
                  <Cell $tone="muted" style={{ textAlign: 'right' }}>
                    <Mono>{shortDate(project.dueAt)}</Mono>
                  </Cell>
                ) : null}
              </div>
            </Row>
          )
        })}
      </Scroll>
    </>
  )
}
