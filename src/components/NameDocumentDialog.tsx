import React, { useEffect, useState } from 'react'
import { Modal } from '@purescience/platform-ui/components/common/overlays/Modal'
import { FormField } from '@purescience/platform-ui/components/common/inputs/FormField'
import { TextField } from '@purescience/platform-ui/components/common/inputs/TextField'
import styled from 'styled-components'
import { Button } from './shellStyles'

/**
 * The modal body is a stretching flex column, so a lone field's control
 * shell (flex: 1 1 auto) grows to fill it — a one-line input rendered
 * 250px tall. A plain block wrapper takes the stretch instead and lets
 * the field keep its natural height.
 */
const Fields = styled.div`
  display: block;
  padding-bottom: 4px;
`

export interface NameDocumentDialogProps {
  open: boolean
  projectName: string
  onClose: () => void
  onCreate: (title: string) => void
}

/**
 * Names the document before it exists. A package folder takes its name
 * from the title, and renaming one afterwards means moving a folder that
 * other projects may already link to — so the name is worth one field.
 */
export function NameDocumentDialog({
  open,
  projectName,
  onClose,
  onCreate,
}: NameDocumentDialogProps): React.ReactElement {
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (open) setTitle('')
  }, [open])

  const submit = (): void => {
    const trimmed = title.trim()
    if (!trimmed) return
    onCreate(trimmed)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New document"
      size="sm"
      footer={
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <span style={{ flex: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button $primary disabled={!title.trim()} onClick={submit}>
            Create and open
          </Button>
        </div>
      }
    >
      <Fields>
      <FormField
        label="Title"
        hint={`Saved to PureDocuments as a .document package, linked to ${projectName}.`}
      >
        <TextField
          value={title}
          autoFocus
          placeholder="e.g. Trust deed notes"
          onChange={event => setTitle(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') submit()
          }}
        />
      </FormField>
      </Fields>
    </Modal>
  )
}
