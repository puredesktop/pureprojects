import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import { Modal } from '@purescience/platform-ui/components/common/overlays/Modal'
import {
  listDocumentsByType as listDocuments,
  listWorkspace,
  type WorkspaceEntry,
} from '../bridge/platformBridge'
import { devSampleWorkspace } from '../lib/devSampleStore'
import { Button, Mono, chrome } from './shellStyles'

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
`

const Crumbs = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
`

const Crumb = styled.button`
  flex: none;
  max-width: 180px;
  padding: 2px 6px;
  border: 0;
  background: transparent;
  color: var(--platform-colors-text-secondary);
  font: inherit;
  font-size: var(--platform-typography-font-size-sm, 13px);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    color: var(--platform-colors-text);
    text-decoration: underline;
  }

  &:last-child {
    color: var(--platform-colors-text);
    cursor: default;
    text-decoration: none;
  }
`

const Search = styled.input.attrs(chrome('field'))`
  width: 220px;
`

const List = styled.div`
  height: 340px;
  overflow-y: auto;
  border: 1px solid var(--platform-colors-border);
  background: var(--platform-colors-elevated);
`

const HeadRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px 108px;
  gap: 12px;
  align-items: center;
  position: sticky;
  top: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--pure-chrome-line);
  background: var(--pure-chrome-bar);
  font-family: var(--platform-typography-font-family-mono);
  font-size: var(--pure-chrome-label-size);
  font-weight: 500;
  letter-spacing: var(--pure-chrome-label-tracking);
  text-transform: uppercase;
  color: var(--pure-chrome-muted);
`

const SortButton = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${({ $active }) =>
    $active ? 'var(--platform-colors-text)' : 'var(--platform-colors-text-secondary)'};
  font: inherit;
  font-size: inherit;
  font-weight: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;

  &:hover {
    color: var(--platform-colors-text);
  }
`

const Row = styled.button<{ $selected?: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px 108px;
  gap: 12px;
  align-items: center;
  width: 100%;
  min-height: var(--pure-chrome-list-row-height);
  padding: 0 12px;
  border: 0;
  border-bottom: 1px solid var(--pure-chrome-line);
  background: ${({ $selected }) =>
    $selected ? 'var(--pure-chrome-selection)' : 'transparent'};
  color: inherit;
  font: inherit;
  font-size: var(--pure-chrome-ui-size);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--pure-chrome-hover);
  }
`

const Name = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: var(--platform-typography-font-size-sm, 13px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Muted = styled.span.attrs(chrome('meta'))``

const Notice = styled.div`
  padding: 18px 12px;
  color: var(--platform-colors-text-disabled);
  font-size: var(--platform-typography-font-size-sm, 13px);
`

type SortKey = 'name' | 'kind' | 'modified'

/**
 * Document suffixes worth offering. The starting folder is DERIVED from
 * where these actually live — an earlier version guessed
 * '/Pure/PureDocuments', which the shell resolves against the filesystem
 * root, so it addressed a directory that has never existed.
 */
const LINKABLE_SUFFIXES = [
  '.document',
  '.book',
  '.canvas',
  '.sheets',
  '.slides',
  '.research',
  '.manuscript',
  '.chart',
  '.gantt',
]

function parentOf(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const cut = trimmed.lastIndexOf('/')
  return cut > 0 ? trimmed.slice(0, cut) : trimmed
}

function formatSize(entry: WorkspaceEntry): string {
  if (entry.isDirectory) return '—'
  if (!entry.byteLength) return '0 KB'
  const kb = entry.byteLength / 1024
  if (kb < 1000) return `${Math.max(1, Math.round(kb))} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function formatWhen(entry: WorkspaceEntry): string {
  if (!entry.modifiedAt) return ''
  const date = new Date(entry.modifiedAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' })
}

export interface DocumentPickerProps {
  open: boolean
  /** True once the shell has answered; gates the dev-only sample tree. */
  bridgeLive: boolean
  onClose: () => void
  onChoose: (choice: { label: string; path: string }) => void
}

/**
 * Browse the workspace and choose a document to link. Typing a path was
 * the placeholder version of this: it demanded the user already know the
 * path, and a typo produced a link that opened nothing.
 *
 * A package document (`.book`, `.canvas`) is a FOLDER, so it is both
 * enterable and choosable — the row opens it, the Link button takes it as
 * the document it is.
 */
export function DocumentPicker({
  open,
  bridgeLive,
  onClose,
  onChoose,
}: DocumentPickerProps): React.ReactElement {
  const bridgeAvailableRef = useRef(bridgeLive)
  bridgeAvailableRef.current = bridgeLive
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<WorkspaceEntry[]>([])
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [selected, setSelected] = useState<WorkspaceEntry | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  const [descending, setDescending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (target: string, fallbacks: string[] = []) => {
    setLoading(true)
    setError(null)
    try {
      const listing = await listWorkspace(target)
      setEntries(listing.entries)
      setParentPath(listing.parentPath)
      setPath(listing.rootPath)
      setSelected(null)
    } catch (loadError) {
      // Only when NO shell answered. `import.meta.env.DEV` is true inside
      // the desktop too, so keying off it hid real failures.
      if (!bridgeAvailableRef.current) {
        const sample = devSampleWorkspace(target)
        setEntries(sample.entries as WorkspaceEntry[])
        setParentPath(sample.parentPath)
        setPath(sample.rootPath)
        setSelected(null)
        return
      }
      // The conventional roots may not all exist; fall through them before
      // reporting, so a fresh workspace still opens somewhere useful.
      const [next, ...rest] = fallbacks
      if (next) {
        await load(next, rest)
        return
      }
      setError(
        loadError instanceof Error ? loadError.message : 'that folder could not be read',
      )
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    void (async () => {
      setLoading(true)
      try {
        // Where the user's documents really are, according to the shell.
        const documents = await listDocuments(LINKABLE_SUFFIXES)
        const roots = [...new Set(documents.map(entry => parentOf(entry.path)))]
        const start = roots[0]
        if (start) {
          await load(start, roots.slice(1))
          return
        }
        setError('No documents found in the workspace yet.')
        setEntries([])
      } catch (startError) {
        if (!bridgeAvailableRef.current) {
          const sample = devSampleWorkspace('/Pure/PureDocuments')
          setEntries(sample.entries as WorkspaceEntry[])
          setParentPath(sample.parentPath)
          setPath(sample.rootPath)
          return
        }
        setError(
          startError instanceof Error
            ? startError.message
            : 'the workspace could not be read',
        )
      } finally {
        setLoading(false)
      }
    })()
  }, [open, load])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = needle
      ? entries.filter(entry => entry.name.toLowerCase().includes(needle))
      : entries
    const direction = descending ? -1 : 1
    return [...filtered].sort((a, b) => {
      // Folders lead in EVERY ordering — they are the way deeper, not
      // items competing with files for a place in the list. The direction
      // therefore applies to the sort key only; reversing the whole array
      // would sink the folders to the bottom on a descending sort.
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      if (sort === 'modified') {
        return direction * a.modifiedAt.localeCompare(b.modifiedAt)
      }
      if (sort === 'kind') {
        const byKind = a.kind.localeCompare(b.kind)
        if (byKind !== 0) return direction * byKind
      }
      return (
        direction * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      )
    })
  }, [entries, query, sort, descending])

  const crumbs = useMemo(() => {
    const parts = path.split('/').filter(Boolean)
    return parts.map((part, index) => ({
      name: part,
      path: `/${parts.slice(0, index + 1).join('/')}`,
    }))
  }, [path])

  const toggleSort = (key: SortKey): void => {
    if (sort === key) {
      setDescending(value => !value)
      return
    }
    setSort(key)
    setDescending(key === 'modified')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Link a document"
      size="lg"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <Muted>
            {selected ? selected.path : 'Choose a document, or open a folder to look inside.'}
          </Muted>
          <span style={{ flex: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button
            $primary
            disabled={!selected}
            onClick={() => {
              if (!selected) return
              onChoose({ label: selected.name, path: selected.path })
              onClose()
            }}
          >
            Link
          </Button>
        </div>
      }
    >
      <Bar>
        <Button disabled={!parentPath} onClick={() => parentPath && void load(parentPath)}>
          Up
        </Button>
        <Crumbs>
          {crumbs.map(crumb => (
            <Crumb key={crumb.path} onClick={() => void load(crumb.path)}>
              {crumb.name}
            </Crumb>
          ))}
        </Crumbs>
        <Search
          value={query}
          placeholder="Filter this folder"
          onChange={event => setQuery(event.target.value)}
        />
      </Bar>

      <List>
        <HeadRow>
          <SortButton $active={sort === 'name'} onClick={() => toggleSort('name')}>
            Name {sort === 'name' ? (descending ? '↓' : '↑') : ''}
          </SortButton>
          <SortButton $active={sort === 'kind'} onClick={() => toggleSort('kind')}>
            Kind {sort === 'kind' ? (descending ? '↓' : '↑') : ''}
          </SortButton>
          <SortButton $active={sort === 'modified'} onClick={() => toggleSort('modified')}>
            Modified {sort === 'modified' ? (descending ? '↓' : '↑') : ''}
          </SortButton>
        </HeadRow>

        {loading ? (
          <Notice>Reading {path}…</Notice>
        ) : error ? (
          <Notice>{error}</Notice>
        ) : visible.length === 0 ? (
          <Notice>{query ? 'Nothing here matches that.' : 'This folder is empty.'}</Notice>
        ) : (
          visible.map(entry => (
            <Row
              key={entry.path}
              $selected={selected?.path === entry.path}
              onClick={() => setSelected(entry)}
              onDoubleClick={() => {
                if (entry.isDirectory) void load(entry.path)
              }}
            >
              <Name>
                {entry.isDirectory ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ flex: 'none', opacity: 0.7 }}>
                    <path d="M2 4h4.5L8 5.6h6V13H2z" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ flex: 'none', opacity: 0.55 }}>
                    <path d="M3.5 2h6L13 5.2V14h-9.5z" strokeLinejoin="round" />
                    <path d="M9.3 2.2v3.2h3.3" />
                  </svg>
                )}
                {entry.name}
              </Name>
              <Muted>{entry.isDirectory ? 'folder' : entry.extension || entry.kind}</Muted>
              <Muted>
                <Mono>{formatWhen(entry) || formatSize(entry)}</Mono>
              </Muted>
            </Row>
          ))
        )}
      </List>
    </Modal>
  )
}
