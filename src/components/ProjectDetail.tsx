import React, { useEffect, useState } from 'react'
import styled from 'styled-components'
import {
  completedCount,
  daysUntil,
  isArchived,
  nextDeliverable,
} from '../lib/projectModel'
import {
  activityWhen,
  journalDraftFromActivity,
  type ProjectActivityRow,
} from '../lib/projectActivity'
import { isWebLink, linkMeta, parseLinkTarget } from '../lib/projectLinks'
import { relativeDue, shortDate } from './ProjectsList'
import { Bar, BarFill, Button, Kicker, Mono, StatusChip, chrome } from './shellStyles'
import { isDocumentPackage } from '../lib/projectDocument'
import { exportableDocuments } from '../lib/documentExport'
import type { Deliverable, Project, ProjectLink } from '../types'

const Pane = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
`

const Band = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: none;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--projects-line);
`

const Title = styled.h1`
  margin: 0;
  font-size: var(--platform-typography-font-size-xl, 24px);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
`

const Summary = styled.p`
  margin: 0;
  max-width: 800px;
  color: var(--platform-colors-text-secondary);
  line-height: 1.6;
`

const BandMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--platform-colors-text-secondary);
  font-size: var(--pure-chrome-ui-size);
`

const Columns = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex: 1;
  min-width: 0;
  padding: 22px 24px;
  overflow-y: auto;
`

/** The right column — waiting on, documents: the platform sidebar. */
const Aside = styled.aside.attrs(chrome('sidebar', { 'data-side': 'right' }))`
  gap: 22px;
  padding: 22px var(--pure-chrome-inset);
`

const SectionHead = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  ${Kicker} {
    padding: 0;
  }
`

const Rule = styled.span`
  flex: 1;
  height: 1px;
  background: var(--projects-line);
`

const Card = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid var(--projects-line);
  background: var(--platform-colors-elevated);
`

const DeliverableRow = styled.div<{ $current?: boolean }>`
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 96px 248px;
  gap: 12px;
  align-items: center;
  padding: 11px 14px;
  border-bottom: 1px solid var(--projects-line);
  background: ${({ $current }) => ($current ? 'var(--platform-colors-bg)' : 'transparent')};

  &:last-child {
    border-bottom: 0;
  }
`

const Check = styled.button<{ $done?: boolean }>`
  display: block;
  width: 15px;
  height: 15px;
  padding: 0;
  border: 1.5px solid
    ${({ $done }) =>
      $done ? 'var(--platform-colors-semantic-green, #1f8a55)' : 'var(--platform-colors-border-strong, #dadade)'};
  background: ${({ $done }) => ($done ? 'var(--platform-colors-semantic-green, #1f8a55)' : 'transparent')};
  cursor: pointer;
`

const DeliverableTitle = styled.div<{ $done?: boolean }>`
  min-width: 0;
  font-size: 14px;
  font-weight: ${({ $done }) => ($done ? 400 : 500)};
  color: ${({ $done }) => ($done ? 'var(--platform-colors-text-secondary)' : 'inherit')};
  text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
`

const JournalEntry = styled.div<{ $latest?: boolean }>`
  display: flex;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--projects-line);
  border-left: ${({ $latest }) =>
    $latest ? '2px solid var(--projects-accent)' : '1px solid var(--projects-line)'};
  background: var(--platform-colors-elevated);
`

const WaitingCard = styled.div`
  display: flex;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--platform-colors-semantic-orange-border, #e3c98f);
  background: var(--platform-colors-semantic-orange-muted, #f3e5c8);
  color: var(--platform-colors-semantic-orange-text, #7a5114);
`

const LinkRow = styled.button`
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--projects-line);
  background: var(--platform-colors-elevated);
  color: inherit;
  font: inherit;
  font-size: var(--platform-typography-font-size-sm, 13px);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--platform-colors-surface-hover);
  }
`

const InlineForm = styled.form`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px dashed var(--platform-colors-border-strong, #dadade);
  background: var(--platform-colors-surface);
`

const InlineInput = styled.input`
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--projects-line);
  background: var(--platform-colors-elevated);
  color: inherit;
  font: inherit;
  font-size: var(--platform-typography-font-size-sm, 13px);

  &::placeholder {
    color: var(--platform-colors-text-disabled);
  }
`

const InlineTextarea = styled.textarea`
  width: 100%;
  min-height: 56px;
  padding: 8px;
  border: 1px solid var(--projects-line);
  background: var(--platform-colors-elevated);
  color: inherit;
  font: inherit;
  font-size: 13.5px;
  line-height: 1.6;
  resize: vertical;
`

/**
 * One slot, one meaning: it either says this deliverable IS next, or offers
 * to make it next. Fixed width so a row does not reshape under the cursor.
 */
const NextSlot = styled.div`
  display: flex;
  flex: none;
  justify-content: flex-end;
  width: 74px;
`

const MakeNextButton = styled.button`
  flex: none;
  padding: 2px 7px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--platform-colors-text-secondary);
  font: inherit;
  font-family: var(--platform-typography-font-family-mono);
  font-size: var(--pure-chrome-label-size);
  letter-spacing: var(--pure-chrome-label-tracking);
  text-transform: uppercase;
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms ease;

  &:hover {
    border-color: var(--projects-line);
    color: var(--projects-accent-text);
  }
`

const RowActions = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 120ms ease;
`

/** Rows shown before "Show all" — a screenful of recent, not a history. */
const ACTIVITY_COLLAPSED = 5

const ActivityRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 8px;
  margin: 0 -8px;
  font-size: 13.5px;
  color: var(--platform-colors-text);

  &:hover {
    background: var(--platform-colors-surface-hover);
  }
`

/** Marks WHO acted — you or an agent — and nothing else. */
const ActivityDot = styled.span<{ $agent?: boolean }>`
  flex: none;
  align-self: center;
  width: 7px;
  height: 7px;
  background: ${({ $agent }) =>
    $agent
      ? 'var(--platform-colors-semantic-blue-text, #244f87)'
      : 'var(--platform-colors-border-strong, #dadade)'};
`

const ActivityLane = styled.span.attrs(chrome('meta'))`
  flex: none;
`

/**
 * "Move to…" on a deliverable row: a small list of the other projects,
 * opened in place. Picking one carries the deliverable across, unchanged.
 */
function MoveMenu({
  deliverable,
  targets,
  onMove,
}: {
  deliverable: Deliverable
  targets: Array<{ id: string; name: string }>
  onMove: (toProjectId: string) => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const root = React.useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])
  return (
    <MoveRoot ref={root}>
      <IconButton
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Move ${deliverable.title} to another project`}
        onClick={() => setOpen(value => !value)}
      >
        Move to…
      </IconButton>
      {open ? (
        <MoveList role="menu" aria-label="Move to project">
          {targets.map(target => (
            <MoveItem
              key={target.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onMove(target.id)
              }}
            >
              {target.name}
            </MoveItem>
          ))}
        </MoveList>
      ) : null}
    </MoveRoot>
  )
}

const MoveRoot = styled.span`
  position: relative;
  display: inline-flex;
`

const MoveList = styled.div`
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 180px;
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--projects-line);
  border-radius: 10px;
  background: var(--platform-colors-elevated, var(--platform-colors-surface));
  box-shadow: 0 12px 30px rgba(16, 22, 40, 0.16);
`

const MoveItem = styled.button`
  padding: 6px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    background: var(--platform-colors-surface-hover, rgba(16, 22, 40, 0.06));
  }
`

const HoverRow = styled.div`
  &:hover ${RowActions}, &:focus-within ${RowActions} {
    opacity: 1;
  }

  &:hover ${MakeNextButton}, &:focus-within ${MakeNextButton} {
    opacity: 1;
  }
`

const IconButton = styled.button`
  flex: none;
  height: 22px;
  padding: 0 7px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--platform-colors-text-secondary);
  font: inherit;
  font-size: var(--pure-chrome-ui-size);
  cursor: pointer;

  &:hover {
    border-color: var(--projects-line);
    background: var(--pure-chrome-hover);
    color: var(--platform-colors-text);
  }
`

/**
 * The next action is the page's headline, not a footnote in the meta row.
 * A project without one is stalled, and the app already treats that as a
 * defect worth its own filter — so the empty state takes the warning tone
 * rather than a quiet italic aside.
 */
const NextActionBar = styled.div<{ $empty?: boolean }>`
  display: flex;
  align-items: center;
  gap: 16px;
  flex: none;
  padding: 15px 24px;
  border-bottom: 1px solid var(--projects-line);
  border-left: 3px solid
    ${({ $empty }) =>
      $empty
        ? 'var(--platform-colors-semantic-orange, #c98a2b)'
        : 'var(--projects-accent)'};
  background: ${({ $empty }) =>
    $empty
      ? 'var(--platform-colors-semantic-orange-muted, #f3e5c8)'
      : 'var(--platform-colors-elevated)'};
`

const ArchivedBar = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  flex: none;
  padding: 15px 24px;
  border-bottom: 1px solid var(--projects-line);
  border-left: 3px solid var(--platform-colors-border-strong, #dadade);
  background: var(--platform-colors-bg);
`

const NextActionCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
`

const NextActionLabel = styled.span<{ $empty?: boolean }>`
  color: ${({ $empty }) =>
    $empty
      ? 'var(--platform-colors-semantic-orange-text, #7a5114)'
      : 'var(--projects-accent-text)'};
  font-family: var(--platform-typography-font-family-mono);
  font-size: var(--pure-chrome-label-size);
  font-weight: 500;
  letter-spacing: var(--pure-chrome-label-tracking);
  text-transform: uppercase;
`

const NextActionText = styled.div<{ $empty?: boolean }>`
  font-size: var(--platform-typography-font-size-lg, 17px);
  font-weight: 500;
  line-height: 1.35;
  color: ${({ $empty }) =>
    $empty ? 'var(--platform-colors-semantic-orange-text, #7a5114)' : 'inherit'};
`

const NextChip = styled.span`
  flex: none;
  padding: 2px 7px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--projects-accent) 14%, transparent);
  color: var(--projects-accent-text);
  font-family: var(--platform-typography-font-family-mono);
  font-size: var(--pure-chrome-label-size);
  letter-spacing: var(--pure-chrome-label-tracking);
  text-transform: uppercase;
`

const ExportBar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--projects-line);
  background: var(--platform-colors-bg);
  font-size: var(--pure-chrome-ui-size);
  color: var(--platform-colors-text-secondary);
`

const Spacer = styled.span`
  flex: 1;
`

/** Only on documents this app can export; a web link has no box to tick. */
const DocPick = styled.input`
  flex: none;
  margin: 0;
  cursor: pointer;
`

const SetDateLink = styled.button`
  flex: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--platform-colors-text-disabled);
  font: inherit;
  font-size: var(--pure-chrome-ui-size);
  cursor: pointer;

  &:hover {
    color: var(--platform-colors-text);
    text-decoration: underline;
  }
`

/** Failures that happen away from the list footer still have to be seen. */
/** Red for a failure, quiet for a result. Saying "saved" in alarm colours
 * teaches people to stop reading the bar. */
const Notice = styled.div<{ $tone?: 'error' | 'info' }>`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  padding: 9px 24px;
  border-bottom: 1px solid
    ${({ $tone }) =>
      $tone === 'info'
        ? 'var(--projects-line)'
        : 'var(--platform-colors-semantic-red-border, #dfb7b1)'};
  background: ${({ $tone }) =>
    $tone === 'info'
      ? 'var(--platform-colors-bg)'
      : 'var(--platform-colors-semantic-red-muted, #f4dfdc)'};
  color: ${({ $tone }) =>
    $tone === 'info'
      ? 'var(--platform-colors-text-secondary)'
      : 'var(--platform-colors-semantic-red-text, #8a2d24)'};
  font-size: var(--platform-typography-font-size-sm, 13px);
`

const JournalPrompt = styled.div`
  padding: 12px 13px;
  border: 1px dashed var(--platform-colors-border-strong, #dadade);
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text-secondary);
  font-size: var(--platform-typography-font-size-sm, 13px);
  line-height: 1.6;
  max-width: 640px;
`

const Empty = styled.div`
  color: var(--platform-colors-text-disabled);
  font-size: var(--platform-typography-font-size-sm, 13px);
`

export interface ProjectDetailProps {
  project: Project
  now: Date
  /** A failure worth the user's attention, shown above the content. */
  notice?: string | null
  noticeTone?: 'error' | 'info'
  onDismissNotice?: () => void
  onEdit: () => void
  onSetArchived: (archived: boolean) => void
  onSetNextAction: (text: string) => void
  /** Complete the next action: closes its deliverable if one matches. */
  onCompleteNextAction: () => void
  onToggleDeliverable: (deliverable: Deliverable) => void
  onAddDeliverable: (input: { title: string; owner: string; dueAt: string }) => void
  onUpdateDeliverable: (
    deliverableId: string,
    patch: { title?: string; owner?: string; dueAt?: string },
  ) => void
  onRemoveDeliverable: (deliverableId: string) => void
  /** Other projects a deliverable could move to (living, not this one). */
  moveTargets?: Array<{ id: string; name: string }>
  onMoveDeliverable?: (deliverableId: string, toProjectId: string) => void
  onMakeNext: (deliverable: Deliverable) => void
  onAddWaitingOn: (waiting: { person: string; what: string }) => void
  /** null resolves every outstanding wait at once. */
  onResolveWaitingOn: (waitingId: string | null) => void
  /** This project's ledger entries, newest first. */
  activity: ProjectActivityRow[]
  onAddJournalEntry: (entry: { title: string; body: string }) => void
  onEditJournalEntry: (entryId: string, patch: { title: string; body: string }) => void
  onRemoveJournalEntry: (entryId: string) => void
  onBrowseForDocument: () => void
  /** Link a page on the web, rather than a workspace resource. */
  onLinkUrl: (link: { label: string; path: string }) => void
  onCreateDocument: () => void
  onRenameLink: (link: ProjectLink, title: string) => void
  onOpenDocument: (link: { path: string; label: string }) => void
  /** Bundle the chosen documents into a zip the person picks a home for. */
  onDownloadZip: (packagePaths: string[]) => void
  /** Write a PDF beside each chosen document. */
  onExportPdf: (packagePaths: string[]) => void
  onRemoveLink: (linkId: string) => void
  onOpenLink: (path: string) => void
  onBack: () => void
}

export function ProjectDetail({
  project,
  now,
  notice,
  noticeTone,
  onDismissNotice,
  onEdit,
  onSetArchived,
  onSetNextAction,
  onCompleteNextAction,
  onToggleDeliverable,
  onAddDeliverable,
  onUpdateDeliverable,
  onRemoveDeliverable,
  moveTargets = [],
  onMoveDeliverable,
  onMakeNext,
  onAddWaitingOn,
  onResolveWaitingOn,
  activity,
  onAddJournalEntry,
  onEditJournalEntry,
  onRemoveJournalEntry,
  onBrowseForDocument,
  onLinkUrl,
  onCreateDocument,
  onRenameLink,
  onOpenDocument,
  onDownloadZip,
  onExportPdf,
  onRemoveLink,
  onOpenLink,
  onBack,
}: ProjectDetailProps): React.ReactElement {
  // Which documents are ticked. Cleared when the project changes so a
  // selection can never carry over onto someone else's documents.
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])
  useEffect(() => {
    setSelectedDocs([])
  }, [project.id])
  const exportable = exportableDocuments(project.links)
  const exportablePaths = new Set(exportable.map(item => item.packagePath))
  const chosen = selectedDocs.filter(path => exportablePaths.has(path))
  const allChosen = exportable.length > 0 && chosen.length === exportable.length
  const someChosen = chosen.length > 0
  const toggleDoc = (path: string): void => {
    setSelectedDocs(current =>
      current.includes(path)
        ? current.filter(item => item !== path)
        : [...current, path],
    )
  }

  const archived = isArchived(project)
  const done = completedCount(project)
  const total = project.deliverables.length
  const days = daysUntil(project.dueAt, now)
  const firstOpen = project.deliverables.find(deliverable => !deliverable.doneAt)
  const openCount = project.deliverables.filter(deliverable => !deliverable.doneAt).length
  const nextDeliverableId = nextDeliverable(project)?.id ?? null

  const [newDeliverable, setNewDeliverable] = useState({ title: '', owner: '', dueAt: '' })
  const [editingDeliverable, setEditingDeliverable] = useState<string | null>(null)
  const [deliverableDraft, setDeliverableDraft] = useState({ title: '', owner: '', dueAt: '' })
  const [waitingDraft, setWaitingDraft] = useState({ person: '', what: '' })
  const [waitingOpen, setWaitingOpen] = useState(false)
  const [journalDraft, setJournalDraft] = useState({ title: '', body: '' })
  const [journalOpen, setJournalOpen] = useState(false)
  const [activityExpanded, setActivityExpanded] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)

  /**
   * Promote an action into the journal: the ledger says WHAT happened,
   * so the draft opens with that as the title and the cursor in the
   * body, where the only thing worth writing — why it mattered — goes.
   */
  const promoteToJournal = (row: ProjectActivityRow): void => {
    setJournalDraft(journalDraftFromActivity(row))
    setJournalOpen(true)
  }
  const [editingEntry, setEditingEntry] = useState<string | null>(null)
  const [entryDraft, setEntryDraft] = useState({ title: '', body: '' })

  const [editingNextAction, setEditingNextAction] = useState(false)
  const [nextActionDraft, setNextActionDraft] = useState('')
  const [renamingLink, setRenamingLink] = useState<string | null>(null)
  const [linkNameDraft, setLinkNameDraft] = useState('')

  const startEditingNextAction = (): void => {
    setNextActionDraft(project.nextAction)
    setEditingNextAction(true)
  }

  const commitNextAction = (event: React.FormEvent | React.KeyboardEvent): void => {
    event.preventDefault()
    const next = nextActionDraft.trim()
    if (!next) return
    onSetNextAction(next)
    setEditingNextAction(false)
  }

  const submitDeliverable = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!newDeliverable.title.trim()) return
    onAddDeliverable({
      title: newDeliverable.title.trim(),
      owner: newDeliverable.owner.trim(),
      dueAt: newDeliverable.dueAt.trim(),
    })
    setNewDeliverable({ title: '', owner: '', dueAt: '' })
  }

  const startEditingDeliverable = (deliverable: Deliverable): void => {
    setEditingDeliverable(deliverable.id)
    setDeliverableDraft({
      title: deliverable.title,
      owner: deliverable.owner,
      dueAt: deliverable.dueAt ? deliverable.dueAt.slice(0, 10) : '',
    })
  }

  const commitDeliverable = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!editingDeliverable || !deliverableDraft.title.trim()) return
    onUpdateDeliverable(editingDeliverable, {
      title: deliverableDraft.title.trim(),
      owner: deliverableDraft.owner.trim(),
      dueAt: deliverableDraft.dueAt.trim(),
    })
    setEditingDeliverable(null)
  }

  return (
    <Pane>
      {/* The band carries identity. What the work is DOING moved below it. */}
      <Band>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button onClick={onBack}>Back</Button>
          <Title>{project.name}</Title>
          <StatusChip $status={project.status}>{project.status}</StatusChip>
          <span style={{ flex: 1 }} />
          {total > 0 ? (
            <Mono style={{ color: 'var(--platform-colors-text-secondary)' }}>
              {done} of {total} done
            </Mono>
          ) : null}
          <Button onClick={onEdit}>Edit project</Button>
          {archived ? null : (
            <Button onClick={() => onSetArchived(true)}>Archive</Button>
          )}
        </div>
        <BandMeta>
          {project.summary ? <span>{project.summary}</span> : null}
          {project.area ? (
            <>
              {project.summary ? <span aria-hidden="true">·</span> : null}
              <span>{project.area}</span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span>{project.people.length ? project.people.join(', ') : 'You'}</span>
          <span aria-hidden="true">·</span>
          {project.dueAt ? (
            <span>
              Due {shortDate(project.dueAt)}
              {days !== null ? `, ${relativeDue(project.dueAt, now)}` : ''}
            </span>
          ) : (
            <SetDateLink onClick={onEdit}>Add a due date</SetDateLink>
          )}
        </BandMeta>
      </Band>

      {archived ? (
        <ArchivedBar>
          <NextActionCopy>
            <NextActionLabel>Archived</NextActionLabel>
            <NextActionText>
              Out of view since {shortDate(project.archivedAt ?? '')}. Nothing was
              lost — it picks up exactly where it left off.
            </NextActionText>
          </NextActionCopy>
          <Button $primary onClick={() => onSetArchived(false)}>
            Make active again
          </Button>
        </ArchivedBar>
      ) : project.status !== 'done' ? (
        editingNextAction ? (
          <NextActionBar as="form" onSubmit={commitNextAction}>
            <NextActionCopy>
              <NextActionLabel>Next action</NextActionLabel>
              <InlineInput
                autoFocus
                value={nextActionDraft}
                placeholder="The single next step — e.g. Send the trust deed to the lawyer"
                onChange={event => setNextActionDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Escape') setEditingNextAction(false)
                  if (event.key === 'Enter') commitNextAction(event)
                }}
              />
            </NextActionCopy>
            <Button type="button" onClick={() => setEditingNextAction(false)}>
              Cancel
            </Button>
            <Button $primary type="submit">
              Set
            </Button>
          </NextActionBar>
        ) : project.nextAction ? (
          <NextActionBar>
            <NextActionCopy>
              <NextActionLabel>Next action</NextActionLabel>
              <NextActionText>{project.nextAction}</NextActionText>
            </NextActionCopy>
            <Button onClick={startEditingNextAction}>Change</Button>
            <Button $primary onClick={onCompleteNextAction}>
              Mark done
            </Button>
          </NextActionBar>
        ) : (
          <NextActionBar $empty>
            <NextActionCopy>
              <NextActionLabel $empty>No next action</NextActionLabel>
              <NextActionText $empty>
                {!firstOpen
                  ? 'Decide the next step, or this quietly stops moving.'
                  : openCount === 1
                    ? 'Nothing here is marked as next. Take the deliverable below, or write a different step.'
                    : `Nothing here is marked as next. Take one of the ${openCount} deliverables below, or write a different step.`}
              </NextActionText>
            </NextActionCopy>
            <Button onClick={startEditingNextAction}>
              {firstOpen ? 'Write a step' : 'Set the next action'}
            </Button>
            {firstOpen ? (
              <Button $primary onClick={() => onMakeNext(firstOpen)}>
                {openCount === 1 ? 'Take it' : 'Take the first one'}
              </Button>
            ) : null}
          </NextActionBar>
        )
      ) : null}

      {notice ? (
        <Notice role="status" $tone={noticeTone ?? 'error'}>
          <span style={{ flex: 1, minWidth: 0 }}>{notice}</span>
          {onDismissNotice ? (
            <IconButton onClick={onDismissNotice}>Dismiss</IconButton>
          ) : null}
        </Notice>
      ) : null}

      <Columns>
        <Content>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionHead>
              <Kicker>Deliverables</Kicker>
              <Rule />
            </SectionHead>
            {total === 0 ? (
              <Empty>Nothing broken out yet — add the first below.</Empty>
            ) : (
              <Card>
                {project.deliverables.map(deliverable =>
                  editingDeliverable === deliverable.id ? (
                    <form key={deliverable.id} onSubmit={commitDeliverable}>
                      <DeliverableRow $current>
                        <span />
                        <InlineInput
                          autoFocus
                          value={deliverableDraft.title}
                          onChange={event =>
                            setDeliverableDraft(draft => ({
                              ...draft,
                              title: event.target.value,
                            }))
                          }
                        />
                        <InlineInput
                          value={deliverableDraft.owner}
                          placeholder="Owner"
                          onChange={event =>
                            setDeliverableDraft(draft => ({
                              ...draft,
                              owner: event.target.value,
                            }))
                          }
                        />
                        <InlineInput
                          type="date"
                          value={deliverableDraft.dueAt}
                          onChange={event =>
                            setDeliverableDraft(draft => ({
                              ...draft,
                              dueAt: event.target.value,
                            }))
                          }
                        />
                      </DeliverableRow>
                      <div
                        style={{
                          display: 'flex',
                          gap: 6,
                          padding: '0 14px 10px',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <IconButton type="submit">Save</IconButton>
                        <IconButton type="button" onClick={() => setEditingDeliverable(null)}>
                          Cancel
                        </IconButton>
                      </div>
                    </form>
                  ) : (
                    <HoverRow key={deliverable.id}>
                      <DeliverableRow $current={deliverable.id === firstOpen?.id}>
                        <Check
                          $done={!!deliverable.doneAt}
                          aria-label={
                            deliverable.doneAt
                              ? `Reopen ${deliverable.title}`
                              : `Complete ${deliverable.title}`
                          }
                          onClick={() => onToggleDeliverable(deliverable)}
                        />
                        <DeliverableTitle $done={!!deliverable.doneAt}>
                          {deliverable.title}
                        </DeliverableTitle>
                        <Mono
                          style={{
                            color: deliverable.owner
                              ? 'var(--platform-colors-text-secondary)'
                              : 'transparent',
                          }}
                          title={deliverable.owner || 'You'}
                        >
                          {deliverable.owner || 'You'}
                        </Mono>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 6,
                          }}
                        >
                          <NextSlot>
                            {deliverable.id === nextDeliverableId ? (
                              <NextChip>Next</NextChip>
                            ) : deliverable.doneAt ? null : (
                              <MakeNextButton
                                onClick={() => onMakeNext(deliverable)}
                                aria-label={`Make ${deliverable.title} the next action`}
                              >
                                Make next
                              </MakeNextButton>
                            )}
                          </NextSlot>
                          <RowActions>
                            <IconButton onClick={() => startEditingDeliverable(deliverable)}>
                              Edit
                            </IconButton>
                            {onMoveDeliverable && moveTargets.length ? (
                              <MoveMenu
                                deliverable={deliverable}
                                targets={moveTargets}
                                onMove={toProjectId => onMoveDeliverable(deliverable.id, toProjectId)}
                              />
                            ) : null}
                            <IconButton
                              onClick={() => onRemoveDeliverable(deliverable.id)}
                              aria-label={`Remove ${deliverable.title}`}
                            >
                              Remove
                            </IconButton>
                          </RowActions>
                          {deliverable.dueAt ? (
                            <Mono style={{ color: 'var(--platform-colors-text-secondary)' }}>
                              {shortDate(deliverable.dueAt)}
                            </Mono>
                          ) : (
                            <SetDateLink
                              onClick={() => startEditingDeliverable(deliverable)}
                            >
                              set date
                            </SetDateLink>
                          )}
                        </div>
                      </DeliverableRow>
                    </HoverRow>
                  ),
                )}
              </Card>
            )}
            <InlineForm onSubmit={submitDeliverable}>
              <InlineInput
                style={{ flex: 1 }}
                value={newDeliverable.title}
                placeholder="Add a deliverable"
                onChange={event =>
                  setNewDeliverable(draft => ({ ...draft, title: event.target.value }))
                }
                onKeyDown={event => {
                  // Explicit rather than relying on implicit form submission,
                  // which does not fire consistently across the fields here.
                  if (event.key === 'Enter') submitDeliverable(event)
                }}
              />
              <InlineInput
                style={{ width: 120 }}
                value={newDeliverable.owner}
                placeholder="Owner"
                onChange={event =>
                  setNewDeliverable(draft => ({ ...draft, owner: event.target.value }))
                }
              />
              <InlineInput
                style={{ width: 140 }}
                type="date"
                value={newDeliverable.dueAt}
                onChange={event =>
                  setNewDeliverable(draft => ({ ...draft, dueAt: event.target.value }))
                }
              />
              <Button type="submit" disabled={!newDeliverable.title.trim()}>
                Add
              </Button>
            </InlineForm>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionHead>
              <Kicker>Journal</Kicker>
              <Rule />
              <IconButton onClick={() => setJournalOpen(open => !open)}>
                {journalOpen ? 'Close' : 'Log an entry'}
              </IconButton>
            </SectionHead>

            {journalOpen ? (
              <form
                onSubmit={event => {
                  event.preventDefault()
                  if (!journalDraft.title.trim()) return
                  onAddJournalEntry({
                    title: journalDraft.title.trim(),
                    body: journalDraft.body.trim(),
                  })
                  setJournalDraft({ title: '', body: '' })
                  setJournalOpen(false)
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <InlineInput
                  autoFocus
                  value={journalDraft.title}
                  placeholder="What happened? e.g. Cut the tooling chapter"
                  onChange={event =>
                    setJournalDraft(draft => ({ ...draft, title: event.target.value }))
                  }
                />
                <InlineTextarea
                  value={journalDraft.body}
                  placeholder="Why it matters — enough that a colleague could follow the decision months later."
                  onChange={event =>
                    setJournalDraft(draft => ({ ...draft, body: event.target.value }))
                  }
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button type="button" onClick={() => setJournalOpen(false)}>
                    Cancel
                  </Button>
                  <Button $primary type="submit" disabled={!journalDraft.title.trim()}>
                    Add entry
                  </Button>
                </div>
              </form>
            ) : null}

            {project.journal.length === 0 && !journalOpen ? (
              <JournalPrompt>
                Nothing logged yet. When something is decided here — what was
                agreed, what changed, why something waits — write it down. This
                is what a colleague reads in six months.
              </JournalPrompt>
            ) : (
              project.journal.map((entry, index) =>
                editingEntry === entry.id ? (
                  <form
                    key={entry.id}
                    onSubmit={event => {
                      event.preventDefault()
                      if (!entryDraft.title.trim()) return
                      onEditJournalEntry(entry.id, {
                        title: entryDraft.title.trim(),
                        body: entryDraft.body.trim(),
                      })
                      setEditingEntry(null)
                    }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <InlineInput
                      autoFocus
                      value={entryDraft.title}
                      onChange={event =>
                        setEntryDraft(draft => ({ ...draft, title: event.target.value }))
                      }
                    />
                    <InlineTextarea
                      value={entryDraft.body}
                      onChange={event =>
                        setEntryDraft(draft => ({ ...draft, body: event.target.value }))
                      }
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <Button type="button" onClick={() => setEditingEntry(null)}>
                        Cancel
                      </Button>
                      <Button $primary type="submit">
                        Save entry
                      </Button>
                    </div>
                  </form>
                ) : (
                  <HoverRow key={entry.id}>
                    <JournalEntry $latest={index === 0}>
                      <Mono
                        style={{
                          flex: 'none',
                          width: 54,
                          paddingTop: 2,
                          color: 'var(--platform-colors-text-secondary)',
                        }}
                      >
                        {shortDate(entry.at)}
                      </Mono>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>
                          {entry.title}
                        </div>
                        {entry.body ? (
                          <div
                            style={{
                              color: 'var(--platform-colors-text-secondary)',
                              fontSize: 13.5,
                              lineHeight: 1.6,
                            }}
                          >
                            {entry.body}
                          </div>
                        ) : null}
                      </div>
                      <RowActions>
                        <IconButton
                          onClick={() => {
                            setEditingEntry(entry.id)
                            setEntryDraft({ title: entry.title, body: entry.body })
                          }}
                        >
                          Edit
                        </IconButton>
                        <IconButton onClick={() => onRemoveJournalEntry(entry.id)}>
                          Remove
                        </IconButton>
                      </RowActions>
                    </JournalEntry>
                  </HoverRow>
                ),
              )
            )}
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <SectionHead>
              <Kicker>Activity</Kicker>
              <Rule />
              {activity.length > ACTIVITY_COLLAPSED ? (
                <IconButton onClick={() => setActivityExpanded(open => !open)}>
                  {activityExpanded
                    ? 'Show less'
                    : `Show all ${activity.length}`}
                </IconButton>
              ) : null}
            </SectionHead>

            {activity.length === 0 ? (
              <Empty>
                Nothing recorded yet — actions you take here show up as you
                take them.
              </Empty>
            ) : (
              (activityExpanded
                ? activity
                : activity.slice(0, ACTIVITY_COLLAPSED)
              ).map(row => (
                <HoverRow key={row.id}>
                  <ActivityRow>
                    <ActivityDot $agent={row.lane === 'agent'} />
                    <span style={{ minWidth: 0, flex: 1 }}>{row.label}</span>
                    <RowActions>
                      <IconButton
                        onClick={() => promoteToJournal(row)}
                        aria-label={`Add “${row.label}” to the journal`}
                      >
                        Add to journal
                      </IconButton>
                    </RowActions>
                    {row.lane === 'agent' ? (
                      <ActivityLane>agent</ActivityLane>
                    ) : null}
                    <Mono
                      style={{
                        flex: 'none',
                        color: 'var(--platform-colors-text-disabled)',
                      }}
                    >
                      {activityWhen(row.at, now)}
                    </Mono>
                  </ActivityRow>
                </HoverRow>
              ))
            )}
          </section>
        </Content>

        <Aside>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SectionHead>
              <Kicker>Waiting on</Kicker>
              <Rule />
              {!waitingOpen ? (
                <IconButton onClick={() => setWaitingOpen(true)}>
                  {project.waitingOn.length === 0 ? 'Add' : 'Add another'}
                </IconButton>
              ) : null}
            </SectionHead>
            {project.waitingOn.map(wait => (
              <WaitingCard key={wait.id}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {wait.person}
                    {wait.what ? ` — ${wait.what}` : ''}
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, opacity: 0.85 }}>
                    Asked {shortDate(wait.askedAt)}
                  </div>
                </div>
                <IconButton
                  title={`${wait.person} came back`}
                  aria-label={`Clear the wait on ${wait.person}`}
                  onClick={() => onResolveWaitingOn(wait.id)}
                >
                  Arrived
                </IconButton>
              </WaitingCard>
            ))}
            {waitingOpen ? (
              <form
                onSubmit={event => {
                  event.preventDefault()
                  if (!waitingDraft.person.trim()) return
                  onAddWaitingOn({
                    person: waitingDraft.person.trim(),
                    what: waitingDraft.what.trim(),
                  })
                  setWaitingDraft({ person: '', what: '' })
                  setWaitingOpen(false)
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <InlineInput
                  autoFocus
                  value={waitingDraft.person}
                  placeholder="Who owes it?"
                  onChange={event =>
                    setWaitingDraft(draft => ({ ...draft, person: event.target.value }))
                  }
                />
                <InlineInput
                  value={waitingDraft.what}
                  placeholder="What are you waiting for?"
                  onChange={event =>
                    setWaitingDraft(draft => ({ ...draft, what: event.target.value }))
                  }
                  onKeyDown={event => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    if (!waitingDraft.person.trim()) return
                    onAddWaitingOn({
                      person: waitingDraft.person.trim(),
                      what: waitingDraft.what.trim(),
                    })
                    setWaitingDraft({ person: '', what: '' })
                    setWaitingOpen(false)
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button type="button" onClick={() => setWaitingOpen(false)}>
                    Cancel
                  </Button>
                  <Button $primary type="submit" disabled={!waitingDraft.person.trim()}>
                    Save
                  </Button>
                </div>
              </form>
            ) : project.waitingOn.length === 0 ? (
              <Empty>Nobody is holding this up.</Empty>
            ) : project.waitingOn.length > 1 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button onClick={() => onResolveWaitingOn(null)}>All arrived</Button>
              </div>
            ) : null}
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SectionHead>
              {exportable.length > 0 ? (
                <DocPick
                  type="checkbox"
                  aria-label={
                    allChosen ? 'Clear selection' : 'Select all documents'
                  }
                  title={allChosen ? 'Clear selection' : 'Select all documents'}
                  checked={allChosen}
                  // Some but not all: the box says "partly", which is the
                  // honest third state and stops a click reading as "these
                  // are already all selected".
                  ref={element => {
                    if (element) element.indeterminate = someChosen && !allChosen
                  }}
                  onChange={() =>
                    setSelectedDocs(
                      allChosen ? [] : exportable.map(item => item.packagePath),
                    )
                  }
                />
              ) : null}
              <Kicker>Documents</Kicker>
              <Rule />
              <IconButton onClick={onCreateDocument}>New…</IconButton>
              <IconButton onClick={onBrowseForDocument}>File…</IconButton>
              <IconButton onClick={() => setUrlOpen(open => !open)}>
                {urlOpen ? 'Close' : 'URL…'}
              </IconButton>
            </SectionHead>

            {urlOpen ? (
              <form
                onSubmit={event => {
                  event.preventDefault()
                  const target = parseLinkTarget(urlDraft)
                  if (!target) {
                    setUrlError('That needs to be a web address.')
                    return
                  }
                  onLinkUrl({ label: target.label, path: target.path })
                  setUrlDraft('')
                  setUrlError(null)
                  setUrlOpen(false)
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <InlineInput
                  autoFocus
                  value={urlDraft}
                  placeholder="https://… — a page this project depends on"
                  onChange={event => {
                    setUrlDraft(event.target.value)
                    if (urlError) setUrlError(null)
                  }}
                />
                {urlError ? <Empty role="alert">{urlError}</Empty> : null}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button type="button" onClick={() => setUrlOpen(false)}>
                    Cancel
                  </Button>
                  <Button $primary type="submit" disabled={!urlDraft.trim()}>
                    Link
                  </Button>
                </div>
              </form>
            ) : null}

            {project.links.length === 0 && !urlOpen ? (
              <Empty>
                Nothing here yet — write a new document, link a file from the
                workspace, or paste a web address.
              </Empty>
            ) : null}
            {chosen.length > 0 ? (
              <ExportBar>
                <span>
                  {chosen.length} selected
                </span>
                <Spacer />
                {allChosen ? null : (
                  <IconButton
                    onClick={() =>
                      setSelectedDocs(exportable.map(item => item.packagePath))
                    }
                  >
                    Select all
                  </IconButton>
                )}
                <IconButton onClick={() => onDownloadZip(chosen)}>
                  Download zip
                </IconButton>
                <IconButton onClick={() => onExportPdf(chosen)}>
                  Export PDF
                </IconButton>
                <IconButton onClick={() => setSelectedDocs([])}>Clear</IconButton>
              </ExportBar>
            ) : null}

            {project.links.map(link =>
              renamingLink === link.id ? (
                <form
                  key={link.id}
                  onSubmit={event => {
                    event.preventDefault()
                    const next = linkNameDraft.trim()
                    if (next) onRenameLink(link, next)
                    setRenamingLink(null)
                  }}
                  style={{ display: 'flex', gap: 6 }}
                >
                  <InlineInput
                    autoFocus
                    style={{ flex: 1 }}
                    value={linkNameDraft}
                    onChange={event => setLinkNameDraft(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Escape') setRenamingLink(null)
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        const next = linkNameDraft.trim()
                        if (next) onRenameLink(link, next)
                        setRenamingLink(null)
                      }
                    }}
                  />
                  <IconButton type="submit">Save</IconButton>
                  <IconButton type="button" onClick={() => setRenamingLink(null)}>
                    Cancel
                  </IconButton>
                </form>
              ) : (
                <HoverRow key={link.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {exportablePaths.has(link.path) ? (
                      <DocPick
                        type="checkbox"
                        checked={chosen.includes(link.path)}
                        aria-label={`Select ${link.label}`}
                        onChange={() => toggleDoc(link.path)}
                      />
                    ) : null}
                    <LinkRow
                      {...(isWebLink(link)
                        ? {
                            // A web page is handed to the browser the way
                            // every other external link in the suite is.
                            as: 'a' as const,
                            href: link.path,
                            target: '_blank',
                            rel: 'noopener noreferrer',
                          }
                        : {
                            onClick: () =>
                              // A .document opens in the editor overlay;
                              // anything else routes to whichever app
                              // claims it.
                              isDocumentPackage(link.path)
                                ? onOpenDocument({
                                    path: link.path,
                                    label: link.label,
                                  })
                                : onOpenLink(link.path),
                          })}
                      title={link.path}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {link.label}
                      </span>
                      <Mono style={{ color: 'var(--platform-colors-text-disabled)' }}>
                        {linkMeta(link)}
                      </Mono>
                    </LinkRow>
                    <RowActions>
                      <IconButton
                        onClick={() => {
                          setRenamingLink(link.id)
                          setLinkNameDraft(link.label)
                        }}
                        aria-label={`Rename ${link.label}`}
                      >
                        Rename
                      </IconButton>
                      <IconButton
                        onClick={() => onRemoveLink(link.id)}
                        aria-label={`Unlink ${link.label}`}
                      >
                        Unlink
                      </IconButton>
                    </RowActions>
                  </div>
                </HoverRow>
              ),
            )}
          </section>
        </Aside>
      </Columns>
    </Pane>
  )
}
