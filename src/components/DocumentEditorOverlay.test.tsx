// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DocumentEditorOverlay,
  type DocumentEditorOverlayProps,
} from './DocumentEditorOverlay'
const editor = vi.hoisted(() => ({ change: (_: string) => {} }))
vi.mock('@purescience/platform-editor', () => ({
  useEditorExtensions: () => [],
  DocumentEditor: ({
    onChange,
    value,
  }: {
    onChange: (html: string) => void
    value: string
  }) => {
    editor.change = onChange
    return <div data-editor>{value}</div>
  },
}))
vi.mock('@purescience/platform-ui/components/common/overlays/Modal', () => ({
  Modal: ({
    children,
    footer,
    onClose,
  }: {
    children: React.ReactNode
    footer: React.ReactNode
    onClose: () => void
  }) => (
    <div>
      <button onClick={onClose}>Dismiss</button>
      {children}
      {footer}
    </div>
  ),
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let node: HTMLDivElement
let root: ReturnType<typeof createRoot>
let props: DocumentEditorOverlayProps
function button(text: string): HTMLButtonElement {
  return [...node.querySelectorAll('button')].find(
    item => item.textContent === text,
  )!
}
function click(text: string) {
  act(() => button(text).click())
}
async function render(patch: Partial<DocumentEditorOverlayProps> = {}) {
  props = { ...props, ...patch }
  await act(async () => root.render(<DocumentEditorOverlay {...props} />))
}
beforeEach(async () => {
  node = document.createElement('div')
  document.body.append(node)
  root = createRoot(node)
  props = {
    open: true,
    packagePath: '/one.document',
    label: 'Notes',
    onClose: vi.fn(),
    onRead: vi.fn(async () => '<p>Existing</p>'),
    onWrite: vi.fn(async () => {}),
    onOpenInWriter: vi.fn(),
  }
})
afterEach(async () => {
  await act(async () => root.unmount())
  node.remove()
})

describe('linked document editing', () => {
  it('never offers an editable blank document after a read fails, and allows retry', async () => {
    vi.mocked(props.onRead).mockRejectedValueOnce(new Error('Cannot read'))
    await render()
    expect(node.querySelector('[data-editor]')).toBeNull()
    expect(node.textContent).toContain('Cannot read')
    expect(button('Open in Writer').disabled).toBe(true)
    await act(async () => button('Retry opening document').click())
    expect(node.querySelector('[data-editor]')?.textContent).toBe(
      '<p>Existing</p>',
    )
    expect(props.onWrite).not.toHaveBeenCalled()
  })
  it('keeps edits and stays open when a close cannot save; retry then closes', async () => {
    vi.mocked(props.onWrite).mockRejectedValueOnce(new Error('Offline'))
    await render()
    act(() => editor.change('<p>Keep me</p>'))
    await act(async () => button('Done').click())
    expect(props.onClose).not.toHaveBeenCalled()
    expect(node.textContent).toContain('Offline')
    await act(async () => button('Done').click())
    expect(props.onWrite).toHaveBeenNthCalledWith(
      2,
      '/one.document',
      '<p>Keep me</p>',
    )
    expect(props.onClose).toHaveBeenCalledOnce()
  })
  it('waits for an autosave already in flight before closing', async () => {
    vi.useFakeTimers()
    let resolve!: () => void
    vi.mocked(props.onWrite).mockImplementation(
      () =>
        new Promise(yes => {
          resolve = yes
        }),
    )
    await render()
    act(() => editor.change('Latest'))
    await act(async () => vi.advanceTimersByTimeAsync(700))
    click('Done')
    expect(props.onClose).not.toHaveBeenCalled()
    await act(async () => {
      resolve()
    })
    expect(props.onClose).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
  it('flushes current edits before handing the document to Writer', async () => {
    let resolve!: () => void
    vi.mocked(props.onWrite).mockImplementation(
      () =>
        new Promise(yes => {
          resolve = yes
        }),
    )
    await render()
    act(() => editor.change('Current'))
    click('Open in Writer')
    expect(props.onOpenInWriter).not.toHaveBeenCalled()
    await act(async () => {
      resolve()
    })
    expect(props.onOpenInWriter).toHaveBeenCalledWith('/one.document')
    expect(props.onClose).toHaveBeenCalledOnce()
  })
  it('keeps the document open when Writer cannot open it', async () => {
    props.onOpenInWriter = vi.fn(async () => {
      throw new Error('Writer unavailable')
    })
    await render()
    await act(async () => button('Open in Writer').click())
    expect(props.onClose).not.toHaveBeenCalled()
    expect(node.textContent).toContain('Writer unavailable')
  })
  it('writes a pending edit to its own path when the parent switches documents', async () => {
    await render()
    act(() => editor.change('First document'))
    await render({ packagePath: '/two.document' })
    expect(props.onWrite).toHaveBeenCalledWith(
      '/one.document',
      'First document',
    )
    act(() => editor.change('Second document'))
    await act(async () => button('Done').click())
    expect(props.onWrite).toHaveBeenLastCalledWith(
      '/two.document',
      'Second document',
    )
  })
  it('does not re-read and reset the editor when callback identities change', async () => {
    await render()
    const freshRead = vi.fn(async () => 'Wrong reset')
    await render({ onRead: freshRead, onWrite: vi.fn(async () => {}) })
    expect(freshRead).not.toHaveBeenCalled()
    expect(node.querySelector('[data-editor]')?.textContent).toContain(
      'Existing',
    )
  })
})
