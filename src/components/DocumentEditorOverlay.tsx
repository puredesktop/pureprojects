import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import { Modal } from '@purescience/platform-ui/components/common/overlays/Modal'
import {
  DocumentEditor,
  useEditorExtensions,
} from '@purescience/platform-editor'
import { DocumentSaveQueue } from '../lib/documentSaveQueue'
import { Button, Mono, chrome } from './shellStyles'

const Frame = styled.div`
  display: flex;
  flex-direction: column;
  /*
   * Fill the dialog rather than taking a fixed slice of the viewport. At 62vh
   * the frame was shorter than the dialog holding it, so a reader opened onto
   * a small window of text with empty modal below it — the document was
   * cramped by the frame, not by the screen. The modal body is already a flex
   * column that stretches its child, so letting go of the fixed height is the
   * whole of it.
   */
  flex: 1;
  min-height: 0;

  /* The editor owns its own scroll; the modal body must not add a second. */
  > * {
    min-height: 0;
  }
`

const Status = styled.span.attrs(chrome('meta'))<{
  $tone?: 'muted' | 'danger'
}>`
  ${({ $tone }) =>
    $tone === 'danger'
      ? '&& { color: var(--platform-colors-semantic-red-text); }'
      : ''}
`

const Loading = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--platform-colors-text-disabled);
`

/** Long enough to coalesce typing, short enough that a close never loses work. */
const SAVE_DEBOUNCE_MS = 700

export interface DocumentEditorOverlayProps {
  open: boolean
  /** Package folder path, e.g. /Pure/PureDocuments/Notes.document */
  packagePath: string | null
  label: string
  onClose: () => void
  onRead: (packagePath: string) => Promise<string>
  onWrite: (packagePath: string, html: string) => Promise<void>
  onOpenInWriter: (packagePath: string) => void | Promise<unknown>
}

/**
 * Edit a linked `.document` without leaving the project. The content is the
 * package's own `document.doc.html`, so PureWriter and the agent tools see
 * exactly what is edited here — this is a second window onto one document,
 * never a second copy of it.
 */
export function DocumentEditorOverlay(
  props: DocumentEditorOverlayProps,
): React.ReactElement | null {
  if (!props.open || !props.packagePath) return null
  // Pending edits belong to the path that was opened, never the next document.
  return (
    <DocumentSession
      key={props.packagePath}
      {...props}
      packagePath={props.packagePath}
    />
  )
}

function DocumentSession({
  packagePath,
  label,
  onClose,
  onRead,
  onWrite,
  onOpenInWriter,
}: DocumentEditorOverlayProps & { packagePath: string }): React.ReactElement {
  const [html, setHtml] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)
  const mounted = useRef(true)
  const timerRef = useRef<number | null>(null)
  const readRef = useRef(onRead)
  const writeRef = useRef(onWrite)
  readRef.current = onRead
  writeRef.current = onWrite
  const saves = useMemo(
    () =>
      new DocumentSaveQueue(content => writeRef.current(packagePath, content)),
    [packagePath],
  )
  const extensions = useEditorExtensions({ placeholder: 'Start writing…' })

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setError(null)
    setStatus('idle')
    void readRef
      .current(packagePath)
      .then(content => {
        if (!cancelled) setHtml(content)
      })
      .catch(readError => {
        if (!cancelled) {
          setError(
            readError instanceof Error
              ? readError.message
              : 'The document could not be read.',
          )
          setStatus('error')
          // Never mount an editable empty document after a failed read.
        }
      })
    return () => {
      cancelled = true
    }
  }, [packagePath, retry])

  const flush = useCallback(async () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    if (saves.dirty) setStatus('saving')
    try {
      await saves.flush()
      if (mounted.current) {
        setStatus('saved')
        setError(null)
      }
    } catch (writeError) {
      if (mounted.current) {
        setStatus('error')
        setError(
          writeError instanceof Error
            ? writeError.message
            : 'That edit was not saved.',
        )
      }
      throw writeError
    }
  }, [saves])

  const onChange = useCallback(
    (content: string) => {
      if (leavingRef.current) return
      saves.change(content)
      setStatus('saving')
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        void flush().catch(() => {})
      }, SAVE_DEBOUNCE_MS)
    },
    [saves, flush],
  )

  const leave = useCallback(
    async (writer: boolean) => {
      if (leavingRef.current) return
      leavingRef.current = true
      setLeaving(true)
      try {
        await flush()
        if (writer) await onOpenInWriter(packagePath)
        onClose()
      } catch (leaveError) {
        setError(
          leaveError instanceof Error
            ? leaveError.message
            : 'The document could not be saved or opened.',
        )
        setStatus('error')
      } finally {
        leavingRef.current = false
        if (mounted.current) setLeaving(false)
      }
    },
    [flush, onClose, onOpenInWriter, packagePath],
  )

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      // Parent teardown still writes to this session's captured path.
      // Normal dismissal uses leave(), which stays open on failure.
      void saves.flush().catch(() => {})
    }
  }, [saves])

  return (
    <Modal
      open
      onClose={() => void leave(false)}
      title={label}
      size="xl"
      footer={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            flexWrap: 'wrap',
          }}
        >
          {error ? (
            <Status $tone="danger" role="alert">
              {error}
            </Status>
          ) : (
            <Status>
              {status === 'saving' ? (
                'Saving…'
              ) : status === 'saved' ? (
                'Saved'
              ) : (
                <Mono>{packagePath}</Mono>
              )}
            </Status>
          )}
          {status === 'error' && html !== null ? (
            <Button
              disabled={leaving}
              onClick={() => void flush().catch(() => {})}
            >
              Retry save
            </Button>
          ) : null}
          <span style={{ flex: 1 }} />
          <Button
            disabled={leaving || html === null}
            onClick={() => void leave(true)}
          >
            Open in Writer
          </Button>
          <Button $primary disabled={leaving} onClick={() => void leave(false)}>
            {leaving ? 'Saving…' : 'Done'}
          </Button>
        </div>
      }
    >
      <Frame>
        {html === null ? (
          <Loading>
            {error ? (
              <Button onClick={() => setRetry(value => value + 1)}>
                Retry opening document
              </Button>
            ) : (
              'Opening the document…'
            )}
          </Loading>
        ) : (
          <DocumentEditor
            value={html}
            extensions={extensions}
            inputFormat="html"
            outputFormat="html"
            onChange={onChange}
          />
        )}
      </Frame>
    </Modal>
  )
}
