import { buildExtensions } from '@purescience/platform-editor'
import {
  buildDocumentsZip,
  exportableDocuments,
  pdfPathFor,
  printableDocuments,
  zipNameFor,
  zipScratchPdfPath,
} from './lib/documentExport'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppFrame } from '@purescience/platform-bridge/components/AppFrame'
import { EmptyState } from '@purescience/platform-ui/components/common/feedback/EmptyState'
import { usePlatformBridge } from '@purescience/platform-ui/bridge/react/usePlatformBridge'
import {
  autosaveDocument,
  appDocumentsDirectory,
  catalogOpen,
  chooseSavePath,
  createDocumentDraft,
  deleteFile,
  readBinaryFile,
  renderDocumentPdf,
  writeBinaryFile,
  isStandaloneDevMode,
  readAppStorageJson,
  readTextFile,
  listOperations,
  onOperationRecorded,
  recordOperation,
  renameDocument,
  writeAppStorageJson,
} from './bridge/platformBridge'
import type { PlatformOperation } from './bridge/platformBridge'
import { projectActivity } from './lib/projectActivity'
import { PROJECTS_APP_SLUG } from './constants'
import { useProjectsAgentTools } from './hooks/useProjectsAgentTools'
import { findProject } from './agents/catalog'
import { ProjectStore } from './lib/projectStore'
import { devSampleStore } from './lib/devSampleStore'
import {
  createDocumentPackage,
  isDocumentPackage,
  documentContentPath,
  documentNameFromPath,
  readDocumentHtml,
  renameDocumentPackage,
  writeDocumentHtml,
} from './lib/projectDocument'
import {
  addDeliverable,
  createProject,
  editJournalEntry,
  emptyStore,
  applyManualOrder,
  archiveProject,
  archivedProjects,
  hasNoNextAction,
  isOverdue,
  linkDocument,
  logJournalEntry,
  matchesQuery,
  removeDeliverable,
  setNextActionFromDeliverable,
  removeJournalEntry,
  removeLink,
  renameLinkLabel,
  repointLinks,
  addWaitingOn as addWaitingOnProject,
  resolveWaitingOn as resolveWaitingOnProject,
  PROJECT_SORT_LABELS,
  livingProjects,
  restoreProject,
  sequenceAfterMove,
  sortForDisplay,
  sortForList,
  sortProjects,
  summarize,
  touch,
  updateDeliverable,
  isArchived,
  moveDeliverable,
} from './lib/projectModel'
import { ProjectDetail } from './components/ProjectDetail'
import { ProjectForm, type ProjectFormValues } from './components/ProjectForm'
import { DevThemeFallback } from './components/DevThemeFallback'
import { DocumentPicker } from './components/DocumentPicker'
import { DocumentEditorOverlay } from './components/DocumentEditorOverlay'
import { NameDocumentDialog } from './components/NameDocumentDialog'
import { ProjectsList } from './components/ProjectsList'
import {
  Attention,
  AttentionDot,
  Body,
  Button,
  Footer,
  Main,
  Search,
  SortSelect,
  Shell,
  Spacer,
  Toolbar,
} from './components/shellStyles'
import type { Deliverable, Project, ProjectLink, ProjectsStore } from './types'
import type { ProjectSort } from './lib/projectModel'

/** Long enough for a slow boot, short enough not to look hung. */
const BOOT_TIMEOUT_MS = 8000

type RailFilter =
  | 'all'
  | 'due-week'
  | 'waiting'
  | 'no-next-action'
  | 'done'
  | 'archived'

export function App(): React.ReactElement {
  const { ready, error: bridgeError } = usePlatformBridge()
  const standalone = isStandaloneDevMode()
  const usable = ready || standalone
  /**
   * True once the shell has actually answered. Every fallback in this file
   * keys off THIS, never `import.meta.env.DEV` — the desktop loads the dev
   * build, so a DEV check treats real bridge failures as "no shell here"
   * and quietly keeps the user's work in memory until the next restart
   * throws it away. That is how documents were lost.
   */
  const bridgeLive = ready
  const bridgeLiveRef = useRef(bridgeLive)
  bridgeLiveRef.current = bridgeLive

  const [store, setStore] = useState<ProjectsStore>(emptyStore)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [writeError, setWriteError] = useState<string | null>(null)
  // Results worth confirming — a zip written, PDFs printed. Kept apart from
  // writeError so a success never arrives in alarm colours.
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const reportStatus = useCallback((message: string) => {
    setStatusNote(message)
  }, [])
  /** True once we know no shell theme is coming (dev harness only). */
  const [themeless, setThemeless] = useState(false)
  const [filter, setFilter] = useState<RailFilter>('all')
  const [area, setArea] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState<{ path: string; label: string } | null>(
    null,
  )
  const [namingDocument, setNamingDocument] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)

  // `now` is captured once per mount rather than per render: relative dates
  // must not shift mid-interaction, and a project is not re-sorted under
  // the pointer because a minute passed.
  const now = useMemo(() => new Date(), [])

  const projectStore = useMemo(
    () =>
      new ProjectStore({
        readJson: readAppStorageJson,
        writeJson: writeAppStorageJson,
      }),
    [],
  )

  useEffect(() => {
    if (!usable) return
    // A plain browser tab has no shell, so no storage bridge ever answers.
    // Show sample projects there rather than a spinner that never resolves.
    if (standalone) {
      setStore(devSampleStore(now))
      setThemeless(true)
      setLoaded(true)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        // A bridge that never answers must not wedge the app on a
        // spinner: fail visibly instead, so the state is readable.
        const loadedStore = await Promise.race([
          projectStore.load(),
          new Promise<never>((_, reject) =>
            window.setTimeout(
              () => reject(new Error('the desktop did not answer in time')),
              BOOT_TIMEOUT_MS,
            ),
          ),
        ])
        if (!cancelled) {
          setStore(loadedStore)
          setLoadError(null)
        }
      } catch (error) {
        if (cancelled) return
        // In dev the app is often opened outside the shell (a browser tab,
        // a preview pane), where no bridge will ever answer. Fall back to
        // sample projects there so the UI is workable; in a real build a
        // failed read is a real failure and says so.
        if (!bridgeLiveRef.current) {
          setStore(devSampleStore(now))
          setThemeless(true)
          setLoadError(null)
        } else {
          setLoadError(
            error instanceof Error ? error.message : 'the project store could not be read',
          )
        }
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [usable, standalone, projectStore, now])

  /**
   * Apply a change locally first so the UI responds to the click, then
   * persist. A write that fails is SURFACED rather than swallowed — the
   * alternative is a control that silently does nothing, which reads as a
   * broken app. The persisted store replaces the optimistic one on success,
   * so a concurrent edit from another window still wins the reconcile.
   */
  // The latest store, for mutations that must not close over a stale render.
  const storeRef = useRef(store)
  storeRef.current = store

  /**
   * Re-read the persisted store. Two instances of this app can be open at
   * once — delegation opens one in a background tab — and each holds its
   * own snapshot, so anything that must be correct rather than merely
   * fast reads through this first.
   */
  const refresh = useCallback(async (): Promise<ProjectsStore> => {
    try {
      const fresh = await projectStore.load()
      setStore(fresh)
      return fresh
    } catch {
      // A failed refresh must not blank the app; the snapshot still works.
      return storeRef.current
    }
  }, [projectStore])

  const mutate = useCallback(
    async (fn: (current: ProjectsStore) => ProjectsStore): Promise<ProjectsStore> => {
      const before = storeRef.current
      const optimistic = fn(before)
      setStore(optimistic)
      try {
        const persisted = await projectStore.update(fn)
        setStore(persisted)
        setWriteError(null)
        return persisted
      } catch (error) {
        if (!bridgeLiveRef.current) {
          // No shell at all (a plain browser tab): keeping the change in
          // memory is what makes the app usable in a dev harness.
          return optimistic
        }
        // A shell IS present and refused the write. Roll the UI back to
        // what is actually on disk and say so — showing the change as if
        // it had landed is how work disappears at the next restart.
        setStore(before)
        setWriteError(
          error instanceof Error
            ? `That change was not saved — ${error.message}`
            : 'That change was not saved.',
        )
        return before
      }
    },
    [projectStore],
  )

  // The other instance (or the agent working in it) may have changed the
  // store while this window sat in the background. Re-read on focus so the
  // user is never looking at a project list that quietly went out of date.
  useEffect(() => {
    if (!usable || standalone) return
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [usable, standalone, refresh])

  // Archived projects are out of view everywhere at once: not counted, not
  // listed, not searched. Splitting here rather than filtering at each call
  // site is the point — a view added later cannot forget the rule.
  const living = useMemo(() => livingProjects(store.projects), [store.projects])
  const archived = useMemo(() => archivedProjects(store.projects), [store.projects])

  // The Archived view only exists while something is in it, so restoring the
  // last one would otherwise strand you in an empty list with no rail item
  // left to tell you where you are.
  useEffect(() => {
    if (filter === 'archived' && archived.length === 0) setFilter('all')
  }, [filter, archived.length])

  const [sort, setSort] = useState<ProjectSort>('manual')

  // Dragging is offered only when what you see IS the list: no filter, no
  // area, no search — and only under "My order", because that is the only
  // ordering a drag can write to. Reordering a subset, or a list the app is
  // sorting by something else, cannot say where the rest go.
  const canReorder = sort === 'manual' && filter === 'all' && !area && !query.trim()

  const summary = useMemo(() => summarize(living, now), [living, now])

  /**
   * The views, with what is in each. This was a left rail of six rows and two
   * headings — a column of chrome for a choice made once a session, taking
   * width the list and the agent drawer both need. As a select it says the
   * same thing in one line.
   *
   * Archived appears only once something is in it, as the rail did: a view
   * that can only ever say nothing is a promise the app cannot keep.
   */
  const viewOptions = useMemo(
    () =>
      [
        { id: 'all' as const, label: 'All projects', count: summary.total },
        { id: 'due-week' as const, label: 'Due this week', count: summary.dueThisWeek },
        { id: 'waiting' as const, label: 'Waiting on someone', count: summary.waiting },
        { id: 'no-next-action' as const, label: 'No next action', count: summary.noNextAction },
        { id: 'done' as const, label: 'Done', count: summary.byStatus.done },
        ...(archived.length > 0
          ? [{ id: 'archived' as const, label: 'Archived', count: archived.length }]
          : []),
      ] satisfies { id: RailFilter; label: string; count: number }[],
    [summary, archived.length],
  )

  const areas = useMemo(
    () => [...new Set(living.map(project => project.area).filter(Boolean))],
    [living],
  )

  const visible = useMemo(() => {
    const pool = filter === 'archived' ? archived : living
    const filtered = pool.filter(project => {
      if (area && project.area !== area) return false
      if (!matchesQuery(project, query)) return false
      switch (filter) {
        case 'due-week': {
          if (project.status === 'done') return false
          const days = project.dueAt
            ? Math.round(
                (new Date(project.dueAt).getTime() - now.getTime()) / 86_400_000,
              )
            : null
          return days !== null && days <= 7
        }
        case 'waiting':
          return project.waitingOn.length > 0
        case 'no-next-action':
          return hasNoNextAction(project)
        case 'done':
          return project.status === 'done'
        default:
          return true
      }
    })
    // The arrangement is a property of the whole list, so it only governs the
    // whole list. Ask a question of it — a filter, an area, a search — and the
    // answer comes back in urgency order, which is what a question is for.
    if (!canReorder && sort === 'manual') return sortForList(filtered, now)
    return sortProjects(filtered, sort, now)
  }, [living, archived, area, query, filter, now, canReorder, sort])

  const selected = useMemo(
    () => store.projects.find(project => project.id === selectedId) ?? null,
    [store.projects, selectedId],
  )

  /**
   * The ledger already holds every action taken on every project — the
   * activity list is a READ of it, never a second store. The list query
   * cannot filter by project, so a generous page is fetched once and
   * narrowed here; the live subscription then keeps the open project
   * current, so the thing you just did appears as you do it.
   */
  const [operations, setOperations] = useState<PlatformOperation[]>([])
  useEffect(() => {
    let cancelled = false
    void listOperations({ limit: 400 })
      .then(result => {
        if (!cancelled) setOperations(result.operations)
      })
      .catch(() => {})
    const unsubscribe = onOperationRecorded(operation => {
      setOperations(current =>
        current.some(item => item.id === operation.id)
          ? current
          : [operation, ...current],
      )
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const selectedActivity = useMemo(
    () =>
      selected ? projectActivity(operations, selected.id, selected.name) : [],
    [operations, selected],
  )

  /**
   * Every manual edit funnels through here so the ledger entry, the
   * optimistic write and the persistence path are identical whichever
   * control the user touched.
   */
  const editProject = useCallback(
    async (
      projectId: string,
      change: (project: Project, nowIso: string) => Project,
      operation?: { kind: string; summary: string },
    ) => {
      const nowIso = new Date().toISOString()
      await mutate(current => ({
        ...current,
        projects: current.projects.map(project =>
          project.id === projectId ? change(project, nowIso) : project,
        ),
      }))
      if (operation) {
        void recordOperation({
          lane: 'user',
          kind: operation.kind,
          summary: operation.summary,
          appSlug: PROJECTS_APP_SLUG,
          refs: { projectId },
        })
      }
    },
    [mutate],
  )

  const submitProjectForm = useCallback(
    async (values: ProjectFormValues) => {
      const nowIso = new Date().toISOString()
      if (editingProjectId) {
        const existing = store.projects.find(item => item.id === editingProjectId)
        await editProject(
          editingProjectId,
          (project, at) =>
            touch(
              {
                ...project,
                ...values,
                // A project reopened from done loses its closing stamp;
                // one closed here gains it and stops waiting on anybody.
                closedAt: values.status === 'done' ? (project.closedAt ?? at) : null,
                waitingOn: values.status === 'done' ? [] : project.waitingOn,
                status:
                  // Editing must not silently clear an active wait: keep
                  // `waiting` unless the user is closing or parking it.
                  project.waitingOn.length > 0 && values.status === 'active'
                    ? 'waiting'
                    : values.status,
              },
              at,
            ),
          { kind: 'project.updated', summary: `Updated “${values.name}”` },
        )
        if (existing && existing.name !== values.name) setSelectedId(editingProjectId)
      } else {
        const project = createProject(values, nowIso)
        await mutate(current => ({ ...current, projects: [...current.projects, project] }))
        void recordOperation({
          lane: 'user',
          kind: 'project.created',
          summary: `Created “${project.name}”`,
          appSlug: PROJECTS_APP_SLUG,
          refs: { projectId: project.id },
        })
        setSelectedId(project.id)
      }
      setFormOpen(false)
      setEditingProjectId(null)
    },
    [editingProjectId, store.projects, editProject, mutate],
  )

  const deleteProject = useCallback(
    async (projectId: string) => {
      const doomed = store.projects.find(item => item.id === projectId)
      await mutate(current => ({
        ...current,
        projects: current.projects.filter(project => project.id !== projectId),
      }))
      void recordOperation({
        lane: 'user',
        kind: 'project.deleted',
        summary: `Deleted “${doomed?.name ?? projectId}”`,
        appSlug: PROJECTS_APP_SLUG,
        refs: { projectId },
      })
      setSelectedId(null)
    },
    [store.projects, mutate],
  )

  /**
   * Completing the next action closes the deliverable it names, if one
   * matches, and then CLEARS it — leaving the project in its honest
   * "no next action" state rather than silently carrying a finished step.
   * The empty state is loud on purpose: that is the moment to decide what
   * happens next, and the moment a project otherwise stalls unnoticed.
   */
  const completeNextAction = useCallback(async () => {
    if (!selected) return
    const done = selected.nextAction
    const match = selected.deliverables.find(
      deliverable =>
        !deliverable.doneAt &&
        deliverable.title.trim().toLowerCase() === done.trim().toLowerCase(),
    )
    await editProject(
      selected.id,
      (project, at) => {
        const closed = match
          ? updateDeliverable(project, match.id, { done: true }, at)
          : project
        return touch({ ...closed, nextAction: '' }, at)
      },
      {
        kind: 'project.next_action_done',
        summary: `Finished “${done}” on ${selected.name}`,
      },
    )
  }, [selected, editProject])

  const onToggleDeliverable = useCallback(
    async (deliverable: Deliverable) => {
      if (!selected) return
      const done = !deliverable.doneAt
      await mutate(current => ({
        ...current,
        projects: current.projects.map(project =>
          project.id === selected.id
            ? updateDeliverable(project, deliverable.id, { done }, new Date().toISOString())
            : project,
        ),
      }))
      // The ledger is the suite's record of what happened; the journal is
      // the curated story. Completing a deliverable belongs in the former.
      void recordOperation({
        lane: 'user',
        kind: done ? 'deliverable.completed' : 'deliverable.reopened',
        summary: `${done ? 'Completed' : 'Reopened'} “${deliverable.title}” on ${selected.name}`,
        appSlug: PROJECTS_APP_SLUG,
        refs: { projectId: selected.id, deliverableId: deliverable.id },
      })
    },
    [selected, mutate],
  )

  /**
   * The bridge slice document creation and editing run on. In a dev
   * harness the fs bridge never answers, so each operation falls back to
   * an in-memory tree — enough to exercise creating and editing without a
   * shell, and unreachable inside PureDesktop.
   */
  /**
   * Document IO goes through the shell's documents service. There is no
   * dev fallback here on purpose: a document that cannot be written must
   * fail loudly, not appear to save into memory that a restart discards.
   */
  // The same extension list DocumentEditorOverlay mounts, so a block an agent
  // writes is a block the reader can show. Built once: buildExtensions creates
  // new instances each call, and the schema must not change under an edit.
  const agentDocumentExtensions = useMemo(() => buildExtensions(), [])

  const documentIo = useMemo(
    () => ({
      createDraft: createDocumentDraft,
      autosave: autosaveDocument,
      rename: renameDocument,
      readTextFile,
    }),
    [],
  )

  const createDocumentForProject = useCallback(
    async (input: {
      projectId: string
      title: string
      html?: string
    }): Promise<{ path: string; name: string }> => {
      const created = await createDocumentPackage(documentIo, { title: input.title })
      if (input.html?.trim()) {
        await writeDocumentHtml(documentIo, created.path, input.html)
      }
      const project = storeRef.current.projects.find(item => item.id === input.projectId)
      await editProject(
        input.projectId,
        (current, at) =>
          linkDocument(current, { label: created.name, path: created.path }, at),
        {
          kind: 'document.created',
          summary: `Created “${created.name}”${project ? ` for ${project.name}` : ''}`,
        },
      )
      return { path: created.path, name: created.name }
    },
    [documentIo, editProject],
  )

  const createAndLinkDocument = useCallback(
    async (title: string) => {
      if (!selected) return
      try {
        const created = await createDocumentPackage(documentIo, { title })
        await editProject(
          selected.id,
          (project, at) =>
            linkDocument(project, { label: created.name, path: created.path }, at),
          {
            kind: 'document.created',
            summary: `Created “${created.name}” for ${selected.name}`,
          },
        )
        setEditingDoc({ path: created.path, label: created.name })
      } catch (createError) {
        setWriteError(
          createError instanceof Error
            ? `The document was not created — ${createError.message}`
            : 'The document was not created.',
        )
      }
    },
    [selected, documentIo, editProject],
  )

  useProjectsAgentTools(usable, {
    store,
    refresh,
    now: () => now,
    mutate,
    createDocument: createDocumentForProject,
    // Read and write go through the same helpers the overlay uses, so an
    // agent edit and a person's edit land in the same file the same way.
    readDocument: (path: string) => readDocumentHtml(documentIo, path),
    writeDocument: (path: string, html: string) =>
      writeDocumentHtml(documentIo, path, html),
    documentExtensions: () => agentDocumentExtensions,
    // Agents export through the same code the buttons use, found by id
    // because an agent may act on a project that is not the one on screen.
    exportDocumentsPdf: async (projectId, paths) => {
      const project = findProject(await refresh(), projectId)
      if (!project) throw new Error(`no project ${projectId}`)
      return renderPdfsFor(project, paths)
    },
    exportProjectZip: async (projectId, paths) => {
      const project = findProject(await refresh(), projectId)
      if (!project) throw new Error(`no project ${projectId}`)
      const name = zipNameFor(project.name, paths.length).replace(
        /\.zip$/,
        `-${Date.now()}.zip`,
      )
      const outputPath = `${await appDocumentsDirectory()}/${name}`
      await writeBinaryFile(outputPath, await buildZipFor(project, paths))
      return outputPath
    },
    // What the user is looking at, so "this project" has an answer.
    openProjectId: () => selectedId,
    focusProject: (projectId: string) => {
      setSelectedId(projectId)
    },
  })

  /**
   * Renaming a linked `.document` renames the package itself — folder and
   * manifest title — and repoints EVERY project that links it, because the
   * folder moves for all of them. Anything else is not ours to move, so
   * only the link's own label changes.
   */
  /**
   * Archiving keeps everything and only changes what the app shows you, so it
   * is safe to do and trivially undone — no confirmation, no dialogue. The
   * detail pane stays open on the archived project with the way back in it.
   */
  const setArchived = useCallback(
    async (project: Project, archived: boolean) => {
      await editProject(
        project.id,
        (current, at) =>
          archived ? archiveProject(current, at) : restoreProject(current, at),
        {
          kind: archived ? 'project.archived' : 'project.restored',
          summary: archived
            ? `Archived ${project.name}`
            : `Made ${project.name} active again`,
        },
      )
    },
    [editProject],
  )

  const reorderProjects = useCallback(
    async (sourceId: string, targetId: string, place: 'before' | 'after') => {
      const at = new Date().toISOString()
      await mutate(current => {
        const ordered = sortForDisplay(livingProjects(current.projects), new Date())
        const sequence = sequenceAfterMove(ordered, sourceId, targetId, place)
        return {
          ...current,
          projects: applyManualOrder(current.projects, sequence, at),
        }
      })
    },
    [mutate],
  )

  /**
   * The export work itself, with the project passed in.
   *
   * The buttons and the agent tools both call these. An agent that exported
   * through a second implementation would drift from what the buttons do,
   * and the difference would surface as "it came out different when I asked
   * for it" — which is the hardest kind of bug to be told about.
   */
  const buildZipFor = useCallback(
    async (project: Project, packagePaths: string[]): Promise<string> => {
      const items = exportableDocuments(project.links).filter(item =>
        packagePaths.includes(item.packagePath),
      )
      const documents = []
      for (const item of items) {
        if (item.kind === 'file') {
          documents.push({
            name: item.name,
            kind: 'file' as const,
            files: [
              {
                name: item.name,
                base64: (await readBinaryFile(item.packagePath)).base64,
              },
            ],
          })
          continue
        }
        const scratch = zipScratchPdfPath(item.packagePath)
        try {
          await renderDocumentPdf({
            htmlPath: documentContentPath(item.packagePath),
            outputPath: scratch,
            loadingMessage: `Preparing ${item.name}…`,
          })
          documents.push({
            name: `${item.name}.pdf`,
            kind: 'file' as const,
            files: [
              { name: `${item.name}.pdf`, base64: (await readBinaryFile(scratch)).base64 },
            ],
          })
        } finally {
          await deleteFile(scratch).catch(() => undefined)
        }
      }
      return buildDocumentsZip(documents)
    },
    [],
  )

  const renderPdfsFor = useCallback(
    async (
      project: Project,
      packagePaths: string[],
    ): Promise<{ written: string[]; skipped: number }> => {
      const printable = printableDocuments(
        exportableDocuments(project.links).filter(item =>
          packagePaths.includes(item.packagePath),
        ),
      )
      const written: string[] = []
      for (const { packagePath, name } of printable) {
        written.push(
          await renderDocumentPdf({
            htmlPath: documentContentPath(packagePath),
            outputPath: pdfPathFor(packagePath, name),
            loadingMessage: `Printing ${name}…`,
          }),
        )
      }
      return { written, skipped: packagePaths.length - printable.length }
    },
    [],
  )

  const downloadDocumentsZip = useCallback(
    async (packagePaths: string[]) => {
      if (!selected || packagePaths.length === 0) return
      try {
        const target = await chooseSavePath({
          defaultName: zipNameFor(selected.name, packagePaths.length),
          filters: [{ name: 'Zip archive', extensions: ['zip'] }],
        })
        // Cancelling the dialog is an answer, not a failure.
        if (!target) return
        await writeBinaryFile(target, await buildZipFor(selected, packagePaths))
        setWriteError(null)
        const converted = exportableDocuments(selected.links).filter(
          item =>
            packagePaths.includes(item.packagePath) && item.kind === 'package',
        ).length
        reportStatus(
          `Saved ${packagePaths.length} item${
            packagePaths.length === 1 ? '' : 's'
          } to ${target}` +
            (converted > 0
              ? ` — ${converted} document${
                  converted === 1 ? '' : 's'
                } converted to PDF.`
              : '.'),
        )
      } catch (error) {
        setWriteError(
          `Could not save the zip. ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    },
    [selected, buildZipFor, reportStatus],
  )

  const exportDocumentsPdf = useCallback(
    async (packagePaths: string[]) => {
      if (!selected || packagePaths.length === 0) return
      try {
        const { written, skipped } = await renderPdfsFor(selected, packagePaths)
        if (written.length === 0) {
          setWriteError(
            'Nothing selected can be converted — PDFs are made from documents written here, not from files attached to the project.',
          )
          return
        }
        setWriteError(null)
        const note =
          written.length === 1
            ? `Wrote ${written[0]}.`
            : `Wrote ${written.length} PDFs beside their documents.`
        reportStatus(
          skipped > 0
            ? `${note} ${skipped} attached file${
                skipped === 1 ? ' was' : 's were'
              } left alone — only documents written here can be converted.`
            : note,
        )
      } catch (error) {
        setWriteError(
          `Could not export the PDFs. ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    },
    [selected, renderPdfsFor, reportStatus],
  )

  const renameLink = useCallback(
    async (link: ProjectLink, title: string) => {
      if (!selected) return
      if (!isDocumentPackage(link.path)) {
        await editProject(selected.id, (project, at) =>
          renameLinkLabel(project, link.id, title, at),
        )
        return
      }
      try {
        const renamed = await renameDocumentPackage(documentIo, link.path, title)
        const nowIso = new Date().toISOString()
        await mutate(current => ({
          ...current,
          projects: repointLinks(
            current.projects,
            link.path,
            { path: renamed.path, label: renamed.name },
            nowIso,
          ),
        }))
        setEditingDoc(current =>
          current?.path === link.path
            ? { path: renamed.path, label: renamed.name }
            : current,
        )
        void recordOperation({
          lane: 'user',
          kind: 'document.renamed',
          summary: `Renamed a document to “${renamed.name}”`,
          appSlug: PROJECTS_APP_SLUG,
          refs: { projectId: selected.id, path: renamed.path },
        })
      } catch (renameError) {
        setWriteError(
          renameError instanceof Error
            ? `The document was not renamed — ${renameError.message}`
            : 'The document was not renamed.',
        )
      }
    },
    [selected, documentIo, editProject, mutate],
  )

  const onOpenLink = useCallback((path: string) => {
    void catalogOpen({ path }).catch(() => undefined)
  }, [])

  if (bridgeError && !standalone) {
    return (
      <AppFrame identityAppSlug={PROJECTS_APP_SLUG}>
        <EmptyState
          tone="error"
          title="PureProjects could not reach the desktop"
          message={bridgeError instanceof Error ? bridgeError.message : String(bridgeError)}
        />
      </AppFrame>
    )
  }

  if (!usable || !loaded) {
    return (
      <AppFrame identityAppSlug={PROJECTS_APP_SLUG}>
        <EmptyState tone="neutral" title="Opening your projects" message="One moment." />
      </AppFrame>
    )
  }

  return (
    <AppFrame identityAppSlug={PROJECTS_APP_SLUG} headerDocumentName={selected?.name}>
      {themeless ? <DevThemeFallback /> : null}
      <Shell data-app="projects">
        {selected ? (
          <ProjectDetail
            project={selected}
            now={now}
            notice={writeError ?? statusNote}
            noticeTone={writeError ? 'error' : 'info'}
            onDownloadZip={paths => void downloadDocumentsZip(paths)}
            onExportPdf={paths => void exportDocumentsPdf(paths)}
            onDismissNotice={() => {
              setWriteError(null)
              setStatusNote(null)
            }}
            onEdit={() => {
              setEditingProjectId(selected.id)
              setFormOpen(true)
            }}
            onSetArchived={archived => void setArchived(selected, archived)}
            onSetNextAction={text =>
              void editProject(
                selected.id,
                (project, at) => touch({ ...project, nextAction: text }, at),
                {
                  kind: 'project.next_action_set',
                  summary: `Next on ${selected.name}: ${text}`,
                },
              )
            }
            onCompleteNextAction={() => void completeNextAction()}
            onToggleDeliverable={onToggleDeliverable}
            onAddDeliverable={input =>
              void editProject(
                selected.id,
                (project, at) => addDeliverable(project, input, at),
                { kind: 'deliverable.added', summary: `Added “${input.title}” to ${selected.name}` },
              )
            }
            onUpdateDeliverable={(deliverableId, patch) =>
              void editProject(selected.id, (project, at) =>
                updateDeliverable(project, deliverableId, patch, at),
              )
            }
            onMakeNext={deliverable =>
              editProject(
                selected.id,
                (project, at) =>
                  setNextActionFromDeliverable(project, deliverable.id, at),
                {
                  kind: 'project.next_action_set',
                  summary: `Next on ${selected.name}: “${deliverable.title}”`,
                },
              )
            }
            moveTargets={store.projects
              .filter(project => project.id !== selected.id && !isArchived(project))
              .map(project => ({ id: project.id, name: project.name }))}
            onMoveDeliverable={(deliverableId, toProjectId) => {
              const target = store.projects.find(project => project.id === toProjectId)
              const title = selected.deliverables.find(item => item.id === deliverableId)?.title ?? 'a deliverable'
              void mutate(current =>
                moveDeliverable(current, { fromProjectId: selected.id, deliverableId, toProjectId }, new Date().toISOString()),
              ).then(() =>
                recordOperation({
                  lane: 'user',
                  kind: 'deliverable.moved',
                  summary: `Moved “${title}” from ${selected.name} to ${target?.name ?? 'another project'}`,
                  appSlug: PROJECTS_APP_SLUG,
                  refs: { projectId: selected.id },
                }),
              )
            }}
            onRemoveDeliverable={deliverableId =>
              void editProject(
                selected.id,
                (project, at) => removeDeliverable(project, deliverableId, at),
                { kind: 'deliverable.removed', summary: `Removed a deliverable from ${selected.name}` },
              )
            }
            onAddWaitingOn={waiting =>
              void editProject(
                selected.id,
                (project, at) =>
                  addWaitingOnProject(
                    project,
                    { ...waiting, askedAt: new Date().toISOString().slice(0, 10) },
                    at,
                  ),
                {
                  kind: 'project.waiting',
                  summary: `Waiting on ${waiting.person} for ${selected.name}`,
                },
              )
            }
            onResolveWaitingOn={waitingId =>
              void editProject(
                selected.id,
                (project, at) => resolveWaitingOnProject(project, waitingId, at),
                {
                  kind: 'project.unblocked',
                  summary: waitingId
                    ? `A wait cleared on ${selected.name}`
                    : `${selected.name} is no longer waiting on anyone`,
                },
              )
            }
            activity={selectedActivity}
            onAddJournalEntry={entry =>
              void editProject(
                selected.id,
                (project, at) => logJournalEntry(project, entry, at),
                { kind: 'journal.logged', summary: `Logged “${entry.title}” on ${selected.name}` },
              )
            }
            onEditJournalEntry={(entryId, patch) =>
              void editProject(selected.id, (project, at) =>
                editJournalEntry(project, entryId, patch, at),
              )
            }
            onRemoveJournalEntry={entryId =>
              void editProject(selected.id, (project, at) =>
                removeJournalEntry(project, entryId, at),
              )
            }
            onBrowseForDocument={() => setPickerOpen(true)}
            onLinkUrl={link =>
              void editProject(
                selected.id,
                (project, at) =>
                  linkDocument(project, { ...link, kind: 'web' }, at),
                {
                  kind: 'project.link_added',
                  summary: `Linked ${link.label} to ${selected.name}`,
                },
              )
            }
            onCreateDocument={() => setNamingDocument(true)}
            onRenameLink={(link, title) => void renameLink(link, title)}
            onOpenDocument={link => setEditingDoc(link)}
            onRemoveLink={linkId =>
              void editProject(selected.id, (project, at) => removeLink(project, linkId, at))
            }
            onOpenLink={onOpenLink}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <>
            <Toolbar>
              <Search
                value={query}
                placeholder="Search projects, people, documents"
                onChange={event => setQuery(event.target.value)}
              />
              <SortSelect
                aria-label="View"
                value={filter}
                onChange={event => setFilter(event.target.value as RailFilter)}
              >
                {viewOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label} ({option.count})
                  </option>
                ))}
              </SortSelect>
              {areas.length > 0 ? (
                <SortSelect
                  aria-label="Area"
                  value={area ?? ''}
                  onChange={event => setArea(event.target.value || null)}
                >
                  <option value="">All areas</option>
                  {areas.map(name => (
                    <option key={name} value={name}>
                      {name} (
                      {living.filter(project => project.area === name).length})
                    </option>
                  ))}
                </SortSelect>
              ) : null}
              <SortSelect
                aria-label="Sort projects"
                value={sort}
                onChange={event => setSort(event.target.value as ProjectSort)}
              >
                {(
                  Object.keys(PROJECT_SORT_LABELS) as ProjectSort[]
                ).map(key => (
                  <option key={key} value={key}>
                    {PROJECT_SORT_LABELS[key]}
                  </option>
                ))}
              </SortSelect>
              <Button
                $primary
                onClick={() => {
                  setEditingProjectId(null)
                  setFormOpen(true)
                }}
              >
                New project
              </Button>
              <Spacer />
              {summary.overdue > 0 ? (
                <Attention $tone="danger">
                  <AttentionDot $tone="danger" />
                  {summary.overdue} overdue
                </Attention>
              ) : null}
              {summary.waiting > 0 ? (
                <Attention $tone="warn">
                  <AttentionDot $tone="warn" />
                  {summary.waiting} waiting on someone
                </Attention>
              ) : null}
            </Toolbar>

            <Body>
              <Main>
                {loadError ? (
                  <EmptyState
                    tone="error"
                    title="Your projects could not be read"
                    message={loadError}
                  />
                ) : store.projects.length === 0 ? (
                  <EmptyState
                    tone="neutral"
                    title="No projects yet"
                    message="Start one with New project, or ask the assistant to."
                  />
                ) : (
                  <ProjectsList
                    projects={visible}
                    selectedId={selectedId}
                    now={now}
                    onSelect={setSelectedId}
                    onReorder={
                      canReorder
                        ? (sourceId, targetId, place) =>
                            void reorderProjects(sourceId, targetId, place)
                        : undefined
                    }
                  />
                )}
                {store.projects.length > 0 ? (
                  <Footer>
                    <span>
                      {visible.length} of{' '}
                      {filter === 'archived' ? archived.length : summary.total}{' '}
                      {filter === 'archived' ? 'archived' : 'projects'}
                    </span>
                    <Spacer />
                    {writeError ? (
                      <span style={{ color: 'var(--platform-colors-semantic-red-text, #8a2d24)' }}>
                        {writeError}
                      </span>
                    ) : summary.noNextAction > 0 ? (
                      <span>{summary.noNextAction} with no next action</span>
                    ) : (
                      <span>Every open project has a next action</span>
                    )}
                  </Footer>
                ) : null}
              </Main>
            </Body>
          </>
        )}
      </Shell>
      <ProjectForm
        open={formOpen}
        project={editingProjectId ? (selected ?? null) : null}
        areaSuggestions={areas}
        onClose={() => {
          setFormOpen(false)
          setEditingProjectId(null)
        }}
        onSubmit={values => void submitProjectForm(values)}
        onDelete={
          editingProjectId ? () => void deleteProject(editingProjectId) : undefined
        }
      />
      <NameDocumentDialog
        open={namingDocument}
        projectName={selected?.name ?? 'this project'}
        onClose={() => setNamingDocument(false)}
        onCreate={title => void createAndLinkDocument(title)}
      />
      <DocumentEditorOverlay
        open={!!editingDoc}
        packagePath={editingDoc?.path ?? null}
        label={editingDoc?.label ?? 'Document'}
        onClose={() => setEditingDoc(null)}
        onRead={packagePath => readDocumentHtml(documentIo, packagePath)}
        onWrite={(packagePath, html) => writeDocumentHtml(documentIo, packagePath, html)}
        onOpenInWriter={packagePath => onOpenLink(packagePath)}
      />
      <DocumentPicker
        open={pickerOpen}
        bridgeLive={bridgeLive}
        onClose={() => setPickerOpen(false)}
        onChoose={choice => {
          if (!selected) return
          void editProject(
            selected.id,
            (project, at) => linkDocument(project, choice, at),
            { kind: 'link.added', summary: `Linked ${choice.label} to ${selected.name}` },
          )
        }}
      />
    </AppFrame>
  )
}
