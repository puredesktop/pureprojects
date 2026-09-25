// The single bridge surface for PureProjects. Components never call
// `bridge.call` directly; every shell capability this app uses is a named
// helper here, and method names always come from `PLATFORM_BRIDGE_METHODS`.
import { bridge } from '@purescience/platform-ui/bridge/client'
import { PLATFORM_BRIDGE_METHODS } from '@purescience/platform-ui/bridge/methods'
import {
  registerPlatformAppObject,
  suggestPlatformDocumentLocation,
} from '@purescience/platform-ui/bridge/documents'
import {
  readPlatformStorageJson,
  writePlatformStorageJson,
} from '@purescience/platform-ui/bridge/storage'
import {
  listPlatformOperations as listPlatformOperationsBridge,
  onPlatformOperationRecorded as onPlatformOperationRecordedBridge,
  recordPlatformOperation as recordPlatformOperationBridge,
} from '@purescience/platform-ui/bridge/operations'
import type {
  PlatformOperation,
  PlatformOperationInput,
  PlatformOperationsListQuery,
  PlatformOperationsListResult,
} from '@purescience/platform-ui/bridge/operations'
import { PROJECTS_APP_SLUG } from '../constants'

export { bridge }

export function isStandaloneDevMode(): boolean {
  return import.meta.env.DEV && window.parent === window
}

export type AppStorageJsonFileName = `${string}.json`

export async function readAppStorageJson(
  fileName: AppStorageJsonFileName,
): Promise<{ value: unknown; version: string | null }> {
  const result = await readPlatformStorageJson({
    appSlug: PROJECTS_APP_SLUG,
    fileName,
  })
  return { value: result.value, version: result.version }
}

/**
 * `ifMatch` carries the version read alongside the value, so two windows
 * editing at once conflict instead of silently overwriting each other.
 */
export async function writeAppStorageJson(
  fileName: AppStorageJsonFileName,
  value: unknown,
  ifMatch: string | null,
): Promise<{ ok: boolean; conflict?: boolean }> {
  const result = await writePlatformStorageJson({
    appSlug: PROJECTS_APP_SLUG,
    fileName,
    value,
    ifMatch,
  })
  if (result.ok) return { ok: true }
  return { ok: false, conflict: 'conflict' in result && result.conflict === true }
}

export type PlatformFileKind =
  | 'folder'
  | 'document'
  | 'image'
  | 'audio'
  | 'video'
  | 'archive'
  | 'code'
  | 'data'
  | 'other'

export interface WorkspaceEntry {
  path: string
  name: string
  extension: string
  kind: PlatformFileKind
  mimeType: string
  byteLength: number
  modifiedAt: string
  isDirectory: boolean
}

export interface WorkspaceListing {
  rootPath: string
  parentPath: string | null
  entries: WorkspaceEntry[]
}

/** List one workspace folder, for the document browser. */
export async function listWorkspace(rootPath: string): Promise<WorkspaceListing> {
  return bridge.call<WorkspaceListing>(PLATFORM_BRIDGE_METHODS.FS_LIST, [{ rootPath }])
}

export async function readTextFile(path: string): Promise<string> {
  return bridge.call<string>(PLATFORM_BRIDGE_METHODS.FS_READ, [path])
}

/** One file's bytes, base64 as it crosses the bridge. */
export async function readBinaryFile(
  path: string,
): Promise<{ mimeType: string; base64: string }> {
  return bridge.call<{ mimeType: string; base64: string }>(
    PLATFORM_BRIDGE_METHODS.FS_READ_BINARY,
    [{ path }],
  )
}

export async function writeBinaryFile(path: string, base64: string): Promise<void> {
  await bridge.call(PLATFORM_BRIDGE_METHODS.FS_WRITE_BINARY, [{ path, base64 }])
}

export async function deleteFile(path: string): Promise<void> {
  await bridge.call(PLATFORM_BRIDGE_METHODS.FS_DELETE, [{ path }])
}

/** Ask where to put a file. Null when the person cancels. */
export async function chooseSavePath(request: {
  defaultName?: string
  filters?: { name: string; extensions: string[] }[]
}): Promise<string | null> {
  const result = await bridge.call<{ path: string | null }>(
    PLATFORM_BRIDGE_METHODS.DIALOG_SAVE_FILE,
    [request],
  )
  return result.path
}

export async function appDocumentsDirectory(): Promise<string> {
  return (await suggestPlatformDocumentLocation()).dir
}

/**
 * Print a document's HTML to PDF through the shell.
 *
 * Browser pagination rather than Paged.js: these are ordinary prose
 * documents, and the shell's own pagination needs nothing declared in the
 * markup, so a document written in the reader prints without being authored
 * for print first.
 */
export async function renderDocumentPdf(request: {
  htmlPath: string
  outputPath: string
  loadingMessage?: string
}): Promise<string> {
  const path = await bridge.call<string>(PLATFORM_BRIDGE_METHODS.RENDER_PRINT_HTML, [
    {
      htmlPath: request.htmlPath,
      outputPath: request.outputPath,
      pageSize: 'A4',
      paginate: 'browser',
      loadingMessage: request.loadingMessage,
    },
  ])
  await registerPlatformAppObject({ appSlug: PROJECTS_APP_SLUG, path })
  return path
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await bridge.call(PLATFORM_BRIDGE_METHODS.FS_WRITE, [path, content])
}

/**
 * Create a folder, tolerating one that already exists — package creation
 * makes the package folder and then its assets dir, and a rerun must not
 * fail on the folder it made last time.
 */
export async function ensureFolder(parentPath: string, name: string): Promise<void> {
  try {
    await bridge.call(PLATFORM_BRIDGE_METHODS.FS_CREATE_FOLDER, [{ parentPath, name }])
  } catch {
    // Already there.
  }
}

// ---- Documents service ----------------------------------------------------
// The SANCTIONED way to create and save documents. It owns the workspace
// root, drafts staging and name uniqueness. Building paths by hand and
// writing them with fs.* was wrong twice over: `/Pure/...` resolves to the
// filesystem root rather than the workspace, and a second write path to the
// same documents is exactly what ps-suite #365 is about.
import {
  autosavePlatformDocument,
  createPlatformDraft,
  listPlatformDocumentsByType,
  renamePlatformDocument,
} from '@purescience/platform-ui/bridge/documents'

export interface DocumentFilePayload {
  name: string | null
  content: string
}

export async function createDocumentDraft(request: {
  appSlug: string
  suffix: string
  kind: 'package' | 'file'
  title?: string
  files: DocumentFilePayload[]
}): Promise<{ path: string }> {
  return createPlatformDraft(request)
}

export async function autosaveDocument(request: {
  path: string
  files: DocumentFilePayload[]
}): Promise<{ savedAt: string }> {
  return autosavePlatformDocument(request)
}

export async function renameDocument(request: {
  path: string
  title: string
  suffix?: string
  appSlug?: string
}): Promise<{ path: string }> {
  return renamePlatformDocument(request)
}

export async function listDocumentsByType(
  suffixes: string[],
): Promise<Array<{ path: string; name: string; mtimeMs: number; isDraft: boolean }>> {
  return listPlatformDocumentsByType({ suffixes })
}

/** Rename a file or package folder in place; returns its new path. */
export async function renamePath(path: string, name: string): Promise<{ path: string }> {
  return bridge.call<{ path: string }>(PLATFORM_BRIDGE_METHODS.FS_RENAME, [
    { path, name },
  ])
}

/** Route a linked document to the app that claims it. */
export async function catalogOpen(request: {
  path: string
  name?: string
}): Promise<{ appSlug: string }> {
  return bridge.call<{ appSlug: string }>(PLATFORM_BRIDGE_METHODS.CATALOG_OPEN, [request])
}

// ---- Operations ledger ----------------------------------------------------
// Suite-wide record of user and agent interactions (root AGENTS.md
// "Operations ledger"). Approval-gated agent tools are recorded centrally by
// the shell; these cover the app's own entries, and the guard keeps
// standalone dev quiet.

export type {
  PlatformOperation,
  PlatformOperationInput,
  PlatformOperationsListQuery,
  PlatformOperationsListResult,
}

function operationsBridgeAvailable(): boolean {
  return !isStandaloneDevMode()
}

export async function recordOperation(
  input: PlatformOperationInput,
): Promise<PlatformOperation | null> {
  if (!operationsBridgeAvailable()) return null
  try {
    return await recordPlatformOperationBridge(input)
  } catch {
    // The ledger is a record, not a gate: never fail the user's edit
    // because the entry could not be written.
    return null
  }
}

export async function listOperations(
  query?: PlatformOperationsListQuery,
): Promise<PlatformOperationsListResult> {
  if (!operationsBridgeAvailable()) return { operations: [] }
  return listPlatformOperationsBridge(query)
}

/**
 * Live ledger entries. The activity list is a read of the ledger, so it
 * has to hear about a write the moment it lands — otherwise the thing
 * you just did is missing from the list until the next open.
 */
export function onOperationRecorded(
  listener: (operation: PlatformOperation) => void,
): () => void {
  if (!operationsBridgeAvailable()) return () => {}
  return onPlatformOperationRecordedBridge(listener)
}
