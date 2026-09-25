/**
 * Documents created from a project are ordinary PureWriter `.document`
 * packages, created through the SHELL'S DOCUMENTS SERVICE.
 *
 * An earlier version built paths like `/Pure/PureDocuments/<name>.document`
 * and wrote them with `fs.*`. That was wrong twice over. The shell resolves
 * those strings with Node's `resolve()`, so `/Pure/...` addressed the
 * filesystem root rather than the workspace and every write failed; and a
 * second write path to the same documents is the defect ps-suite #365
 * describes. `documents.createDraft` owns the workspace root, drafts
 * staging and name uniqueness — none of which this app should reimplement.
 *
 * Package shape (owned by purewriter's manifest, verified on disk):
 *   <name>.document/
 *     document.json      {"title": "<name>"}
 *     document.doc.html  the content
 */

/** The app whose manifest claims `.document`; drafts are filed under it. */
export const DOCUMENT_APP_SLUG = 'writer'
export const DOCUMENT_SUFFIX = '.document'
export const DOCUMENT_MANIFEST_FILE = 'document.json'
export const DOCUMENT_CONTENT_FILE = 'document.doc.html'

export interface DocumentFile {
  name: string | null
  content: string
}

/** The documents-service slice this module needs; injected for tests. */
export interface DocumentIo {
  createDraft(request: {
    appSlug: string
    suffix: string
    kind: 'package' | 'file'
    title?: string
    files: DocumentFile[]
  }): Promise<{ path: string }>
  autosave(request: { path: string; files: DocumentFile[] }): Promise<{ savedAt: string }>
  rename(request: {
    path: string
    title: string
    suffix?: string
    appSlug?: string
  }): Promise<{ path: string }>
  readTextFile(path: string): Promise<string>
}

/** A title the workspace can hold as a folder name. */
export function safeDocumentName(title: string): string {
  const cleaned = title
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
  return cleaned || 'Untitled document'
}

export function documentContentPath(packagePath: string): string {
  return `${packagePath.replace(/\/+$/, '')}/${DOCUMENT_CONTENT_FILE}`
}

export function isDocumentPackage(path: string): boolean {
  return path.endsWith(DOCUMENT_SUFFIX)
}

export function documentNameFromPath(path: string): string {
  const name = path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path
  return name.endsWith(DOCUMENT_SUFFIX)
    ? name.slice(0, -DOCUMENT_SUFFIX.length)
    : name
}

export function initialDocumentHtml(title: string): string {
  const escaped = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<h1>${escaped}</h1>\n<p></p>\n`
}

export interface CreatedDocument {
  path: string
  name: string
}

export async function createDocumentPackage(
  io: DocumentIo,
  input: { title: string; html?: string },
): Promise<CreatedDocument> {
  const title = safeDocumentName(input.title)
  const { path } = await io.createDraft({
    appSlug: DOCUMENT_APP_SLUG,
    suffix: DOCUMENT_SUFFIX,
    kind: 'package',
    title,
    files: [
      {
        name: DOCUMENT_MANIFEST_FILE,
        content: `${JSON.stringify({ title }, null, 2)}\n`,
      },
      {
        name: DOCUMENT_CONTENT_FILE,
        content: input.html?.trim() ? input.html : initialDocumentHtml(title),
      },
    ],
  })
  // The service may have uniquified the name, so read it back from the
  // path rather than assuming the title it was given.
  return { path, name: documentNameFromPath(path) }
}

export async function readDocumentHtml(
  io: DocumentIo,
  packagePath: string,
): Promise<string> {
  return io.readTextFile(documentContentPath(packagePath))
}

export async function writeDocumentHtml(
  io: DocumentIo,
  packagePath: string,
  html: string,
): Promise<void> {
  await io.autosave({
    path: packagePath,
    files: [{ name: DOCUMENT_CONTENT_FILE, content: html }],
  })
}

/**
 * Rename through the service so the folder and the manifest title move
 * together and the workspace stays consistent. Returns the new path, which
 * every link pointing at the old one must follow.
 */
export async function renameDocumentPackage(
  io: DocumentIo,
  packagePath: string,
  nextTitle: string,
): Promise<{ path: string; name: string }> {
  const title = safeDocumentName(nextTitle)
  const { path } = await io.rename({
    path: packagePath,
    title,
    suffix: DOCUMENT_SUFFIX,
    appSlug: DOCUMENT_APP_SLUG,
  })
  return { path, name: documentNameFromPath(path) }
}
