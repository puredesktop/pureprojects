import JSZip from 'jszip'
import { documentNameFromPath, isDocumentPackage } from './projectDocument'
import { isWebLink } from './projectLinks'
import type { ProjectLink } from '../types'

/**
 * Exporting the documents on a project: several at once, as a zip to keep, or
 * as PDFs to send.
 *
 * Only `.document` packages, and only ones this app made. A link can also be a
 * web address or a file the workspace merely points at; neither is ours to
 * bundle, and silently skipping them would make a zip that is quietly missing
 * what somebody selected.
 */
export interface ExportableDocument {
  linkId: string
  /** The package folder, or the file itself. */
  packagePath: string
  name: string
  /**
   * A `.document` package is a folder this app wrote and can print. Anything
   * else attached with File… — a tax return PDF, a spreadsheet, a scan — is a
   * single file we can carry but cannot convert.
   */
  kind: 'package' | 'file'
}

/**
 * Everything on a project that can be put in a zip.
 *
 * Not only the documents this app made: a project's papers are mostly things
 * somebody attached — accounts, returns, scans. Leaving those out of the zip
 * made the feature useless for the projects that most need it, which is what
 * a matter folder is. What stays out is what has no bytes to carry: a web
 * address, a mail or calendar reference.
 */
export function exportableDocuments(links: ProjectLink[]): ExportableDocument[] {
  return links
    .filter(link => !isWebLink(link) && link.kind !== 'mail' && link.kind !== 'event')
    .map(link => {
      const isPackage = isDocumentPackage(link.path)
      const onDisk = isPackage
        ? documentNameFromPath(link.path)
        : fileNameFromPath(link.path)
      return {
        linkId: link.id,
        packagePath: link.path,
        name: exportNameFor(link.label, onDisk, isPackage),
        kind: isPackage ? ('package' as const) : ('file' as const),
      }
    })
}

/**
 * What to call the thing in the zip: what the list calls it.
 *
 * The name on disk drifts from the name on screen — a collision suffix from
 * when the file was created, a label the person has since renamed. Exporting
 * "NZ company registration … Limited 3" when the app has been calling it
 * something else for months makes the archive hard to read.
 *
 * A file keeps its extension whatever the label says, because the extension
 * is not decoration: relabel a PDF "Tax return" and it must still arrive as
 * "Tax return.pdf" or nothing will open it.
 */
export function exportNameFor(
  label: string,
  nameOnDisk: string,
  isPackage: boolean,
): string {
  const clean = safeEntryName(label) || nameOnDisk
  if (isPackage) return clean
  const dot = nameOnDisk.lastIndexOf('.')
  const extension = dot > 0 ? nameOnDisk.slice(dot) : ''
  return extension && !clean.toLowerCase().endsWith(extension.toLowerCase())
    ? `${clean}${extension}`
    : clean
}

/**
 * A label is free text and can hold anything a person typed. A slash would
 * silently become a folder inside the archive, so the separators go.
 */
function safeEntryName(label: string): string {
  return label
    .replace(/[\\/]+/g, '-')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
}

/** Only a package holds HTML we can print; a file is already whatever it is. */
export function printableDocuments(
  items: ExportableDocument[],
): ExportableDocument[] {
  return items.filter(item => item.kind === 'package')
}

function fileNameFromPath(path: string): string {
  return path.replace(/\/+$/, '').split('/').filter(Boolean).at(-1) ?? path
}

/** One file inside a package, as it crosses the bridge. */
export interface PackageFile {
  /** Path relative to the package folder. */
  name: string
  base64: string
}

/**
 * Zip whole packages, folder and all, rather than just their HTML: a document
 * carries its manifest and any images beside it, and a bundle that drops them
 * is not the document.
 */
export async function buildDocumentsZip(
  documents: { name: string; kind?: 'package' | 'file'; files: PackageFile[] }[],
): Promise<string> {
  const zip = new JSZip()
  const used = new Map<string, number>()
  const unique = (name: string): string => {
    // Two projects can attach papers with the same name; the second must not
    // overwrite the first inside the archive.
    const seen = used.get(name) ?? 0
    used.set(name, seen + 1)
    if (seen === 0) return name
    const dot = name.lastIndexOf('.')
    return dot > 0
      ? `${name.slice(0, dot)} (${seen + 1})${name.slice(dot)}`
      : `${name} (${seen + 1})`
  }
  for (const document of documents) {
    if (document.kind === 'file') {
      // An attached file goes in as itself: burying a tax return one folder
      // deep for no reason is not tidier, it is just further away.
      const only = document.files[0]
      if (only) zip.file(unique(document.name), only.base64, { base64: true })
      continue
    }
    const folder = unique(document.name)
    for (const file of document.files) {
      zip.file(`${folder}/${file.name}`, file.base64, { base64: true })
    }
  }
  return zip.generateAsync({ type: 'base64' })
}

/**
 * Where a document's PDF is built on the way into a zip.
 *
 * Inside the package and dot-prefixed: it is scratch, not a document, and it
 * is removed once its bytes are in the archive. Building it beside the
 * package instead would leave a PDF in the workspace every time somebody
 * downloaded a zip.
 */
export function zipScratchPdfPath(packagePath: string): string {
  return `${packagePath.replace(/\/+$/, '')}/.export.pdf`
}

/**
 * Where an exported PDF lands: beside the package, named the way the list
 * names it. Falls back to the folder name when no display name is given.
 */
export function pdfPathFor(packagePath: string, displayName?: string): string {
  const clean = packagePath.replace(/\/+$/, '')
  const parent = clean.slice(0, clean.lastIndexOf('/'))
  const name = safeEntryName(displayName ?? '') || documentNameFromPath(clean)
  return `${parent}/${name}.pdf`
}

/** A zip named for what is in it, so a folder of them stays legible. */
export function zipNameFor(projectName: string, count: number): string {
  const clean = projectName.replace(/[^\w .-]+/g, '').trim() || 'Documents'
  return count === 1 ? `${clean} — 1 document.zip` : `${clean} — ${count} documents.zip`
}
