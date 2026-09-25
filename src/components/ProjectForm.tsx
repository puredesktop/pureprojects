import React, { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Modal } from '@purescience/platform-ui/components/common/overlays/Modal'
import { FormField } from '@purescience/platform-ui/components/common/inputs/FormField'
import { TextField } from '@purescience/platform-ui/components/common/inputs/TextField'
import { TextAreaField } from '@purescience/platform-ui/components/common/inputs/TextAreaField'
import { SelectField } from '@purescience/platform-ui/components/common/inputs/SelectField'
import { Button } from './shellStyles'
import type { Project, ProjectStatus } from '../types'

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
  padding: 4px 0 8px;
`

const Wide = styled.div`
  grid-column: 1 / -1;
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

/** `waiting` is absent on purpose — it is set by naming who you await. */
const STATUS_OPTIONS = [
  { value: 'idea', label: 'Idea' },
  { value: 'active', label: 'Active' },
  { value: 'done', label: 'Done' },
] as const

export interface ProjectFormValues {
  name: string
  summary: string
  area: string
  status: ProjectStatus
  nextAction: string
  dueAt: string
  people: string[]
}

export interface ProjectFormProps {
  open: boolean
  /** Absent for a new project. */
  project?: Project | null
  areaSuggestions: string[]
  onClose: () => void
  onSubmit: (values: ProjectFormValues) => void
  onDelete?: () => void
}

export function ProjectForm({
  open,
  project,
  areaSuggestions,
  onClose,
  onSubmit,
  onDelete,
}: ProjectFormProps): React.ReactElement {
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [area, setArea] = useState('')
  const [status, setStatus] = useState<ProjectStatus>('active')
  const [nextAction, setNextAction] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [people, setPeople] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Re-seed whenever the dialog opens so an edit never shows the last
  // project's values, and a cancelled edit leaves nothing behind.
  useEffect(() => {
    if (!open) return
    setName(project?.name ?? '')
    setSummary(project?.summary ?? '')
    setArea(project?.area ?? '')
    setStatus(project && project.status !== 'waiting' ? project.status : 'active')
    setNextAction(project?.nextAction ?? '')
    setDueAt(project?.dueAt ? project.dueAt.slice(0, 10) : '')
    setPeople((project?.people ?? []).join(', '))
    setConfirmingDelete(false)
  }, [open, project])

  const submit = (): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit({
      name: trimmed,
      summary: summary.trim(),
      area: area.trim(),
      status,
      nextAction: nextAction.trim(),
      dueAt: dueAt.trim(),
      people: people
        .split(',')
        .map(person => person.trim())
        .filter(Boolean),
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? 'Edit project' : 'New project'}
      size="md"
      footer={
        <Actions>
          {project && onDelete ? (
            confirmingDelete ? (
              <>
                <Button
                  onClick={() => {
                    onDelete()
                    onClose()
                  }}
                >
                  Delete permanently
                </Button>
                <Button onClick={() => setConfirmingDelete(false)}>Keep</Button>
              </>
            ) : (
              <Button onClick={() => setConfirmingDelete(true)}>Delete…</Button>
            )
          ) : null}
          <span style={{ flex: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button $primary onClick={submit} disabled={!name.trim()}>
            {project ? 'Save changes' : 'Create project'}
          </Button>
        </Actions>
      }
    >
      <Grid>
        <Wide>
          <FormField label="Name">
            <TextField
              value={name}
              autoFocus
              placeholder="What is this project called?"
              onChange={event => setName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') submit()
              }}
            />
          </FormField>
        </Wide>

        <Wide>
          <FormField label="Summary" hint="One or two sentences — what this is, for whom.">
            <TextAreaField
              rows={2}
              value={summary}
              onChange={event => setSummary(event.target.value)}
            />
          </FormField>
        </Wide>

        <Wide>
          <FormField
            label="Next action"
            hint="The single next step. A project without one stalls quietly."
          >
            <TextField
              value={nextAction}
              placeholder="e.g. Send the draft to Mathias"
              onChange={event => setNextAction(event.target.value)}
            />
          </FormField>
        </Wide>

        <FormField label="Area" hint={areaSuggestions.join(' · ') || 'e.g. Writing, Clients'}>
          <TextField
            value={area}
            list="pureprojects-areas"
            onChange={event => setArea(event.target.value)}
          />
          <datalist id="pureprojects-areas">
            {areaSuggestions.map(suggestion => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </FormField>

        <FormField label="Status" hint="Waiting is set by naming who you are waiting on.">
          <SelectField
            value={status}
            options={STATUS_OPTIONS}
            onValueChange={value => setStatus(value as ProjectStatus)}
          />
        </FormField>

        <FormField label="Due">
          <TextField
            type="date"
            value={dueAt}
            onChange={event => setDueAt(event.target.value)}
          />
        </FormField>

        <FormField label="People" hint="Comma separated.">
          <TextField
            value={people}
            placeholder="Mathias, Vincent"
            onChange={event => setPeople(event.target.value)}
          />
        </FormField>
      </Grid>
    </Modal>
  )
}
