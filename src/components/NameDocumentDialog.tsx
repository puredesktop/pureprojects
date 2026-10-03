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
  onCreate: (title: string) => Promise<void>
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitle('')
      setError(null)
    }
  }, [open])

  const submit = async (): Promise<void> => {
    const trimmed = title.trim()
    if (!trimmed || saving) return
    setSaving(true)
    setError(null)
    try {
      await onCreate(trimmed)
      onClose()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'The document was not created.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose()
      }}
      title="New document"
      size="sm"
      footer={
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <span style={{ flex: 1 }} />
          <Button disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button
            $primary
            disabled={saving || !title.trim()}
            onClick={() => void submit()}
          >
            Create and open
          </Button>
        </div>
      }
    >
      {error ? <p role="alert">{error}</p> : null}
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
              if (event.key === 'Enter') void submit()
            }}
          />
        </FormField>
      </Fields>
    </Modal>
  )
}
