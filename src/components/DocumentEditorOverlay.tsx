import React, { useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { Modal } from '@purescience/platform-ui/components/common/overlays/Modal'
import {
  DocumentEditor,
  useEditorExtensions,
} from '@purescience/platform-editor'
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

const Status = styled.span.attrs(chrome('meta'))<{ $tone?: 'muted' | 'danger' }>`
  ${({ $tone }) =>
    $tone === 'danger' ? '&& { color: var(--platform-colors-semantic-red-text); }' : ''}
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
  onOpenInWriter: (packagePath: string) => void
}

/**
 * Edit a linked `.document` without leaving the project. The content is the
 * package's own `document.doc.html`, so PureWriter and the agent tools see
 * exactly what is edited here — this is a second window onto one document,
 * never a second copy of it.
 */
export function DocumentEditorOverlay({
  open,
  packagePath,
  label,
  onClose,
  onRead,
  onWrite,
  onOpenInWriter,
}: DocumentEditorOverlayProps): React.ReactElement {
  const [html, setHtml] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)
  const pendingRef = useRef<string | null>(null)
  const extensions = useEditorExtensions({ placeholder: 'Start writing…' })

  useEffect(() => {
    if (!open || !packagePath) return
    let cancelled = false
    setHtml(null)
    setError(null)
    setStatus('idle')
    void (async () => {
      try {
        const content = await onRead(packagePath)
        if (!cancelled) setHtml(content)
      } catch (readError) {
        if (!cancelled) {
          setError(
            readError instanceof Error ? readError.message : 'the document could not be read',
          )
          setHtml('')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, packagePath, onRead])

  const flush = useCallback(async () => {
    const pending = pendingRef.current
    if (!packagePath || pending === null) return
    pendingRef.current = null
    setStatus('saving')
    try {
      await onWrite(packagePath, pending)
      setStatus('saved')
      setError(null)
    } catch (writeError) {
      setStatus('error')
      setError(
        writeError instanceof Error ? writeError.message : 'that edit was not saved',
      )
    }
  }, [packagePath, onWrite])

  const onChange = useCallback(
    (content: string) => {
      pendingRef.current = content
      setStatus('saving')
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        void flush()
      }, SAVE_DEBOUNCE_MS)
    },
    [flush],
  )

  // A debounced write that never lands is a lost edit: closing the overlay
  // flushes whatever is pending rather than dropping it on unmount.
  const close = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    void flush().finally(onClose)
  }, [flush, onClose])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <Modal
      open={open}
      onClose={close}
      title={label}
      // A document is read, not glanced at: xl is the widest size the modal
      // offers short of fullscreen, and its paper keeps the same 72ch measure,
      // so the extra width becomes margin around the text rather than longer
      // lines to track back across.
      size="xl"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          {error ? (
            <Status $tone="danger">{error}</Status>
          ) : (
            <Status>
              {status === 'saving'
                ? 'Saving…'
                : status === 'saved'
                  ? 'Saved'
                  : packagePath
                    ? <Mono>{packagePath}</Mono>
                    : ''}
            </Status>
          )}
          <span style={{ flex: 1 }} />
          <Button onClick={() => packagePath && onOpenInWriter(packagePath)}>
            Open in Writer
          </Button>
          <Button $primary onClick={close}>
            Done
          </Button>
        </div>
      }
    >
      <Frame>
        {html === null ? (
          <Loading>Opening the document…</Loading>
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
