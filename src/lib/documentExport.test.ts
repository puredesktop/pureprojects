import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  buildDocumentsZip,
  exportNameFor,
  exportableDocuments,
  pdfPathFor,
  printableDocuments,
  zipNameFor,
  zipScratchPdfPath,
} from './documentExport'
import type { ProjectLink } from '../types'

/** A link as the app makes one: the label starts as the name on disk. */
const link = (
  id: string,
  path: string,
  kind: ProjectLink['kind'] = 'document',
  label?: string,
) =>
  ({
    id,
    label:
      label ??
      (path.split('/').pop() ?? path).replace(/\.document$/, ''),
    path,
    kind,
  }) as ProjectLink

describe('which links can be exported', () => {
  it('takes everything with bytes behind it, and leaves out what has none', () => {
    // A web address and a mail reference have nothing to put in a zip. A
    // package and a file both do, and both belong in one.
    const links = [
      link('a', '/Pure/PureDocuments/Deed.document'),
      link('b', 'https://example.com/tax', 'web'),
      link('c', 'mailto:x@example.com', 'mail'),
      link('d', '/Pure/PureDocuments/Method.book'),
    ]
    expect(exportableDocuments(links).map(item => [item.name, item.kind])).toEqual([
      ['Deed', 'package'],
      ['Method.book', 'file'],
    ])
  })
})

describe('the zip', () => {
  const files = [{ name: 'document.doc.html', base64: btoa('<p>Hi</p>') }]

  it('keeps each document in its own folder, manifest and images included', async () => {
    const base64 = await buildDocumentsZip([
      { name: 'Deed', files: [...files, { name: 'assets/fig.png', base64: btoa('png') }] },
    ])
    const zip = await JSZip.loadAsync(base64, { base64: true })
    expect(Object.keys(zip.files).sort()).toContain('Deed/document.doc.html')
    expect(Object.keys(zip.files)).toContain('Deed/assets/fig.png')
  })

  it('does not let one document overwrite another of the same name', async () => {
    const zip = await JSZip.loadAsync(
      await buildDocumentsZip([
        { name: 'Notes', files },
        { name: 'Notes', files },
      ]),
      { base64: true },
    )
    expect(Object.keys(zip.files)).toContain('Notes/document.doc.html')
    expect(Object.keys(zip.files)).toContain('Notes (2)/document.doc.html')
  })

  it('round-trips the bytes it was given', async () => {
    const zip = await JSZip.loadAsync(await buildDocumentsZip([{ name: 'Deed', files }]), {
      base64: true,
    })
    expect(await zip.file('Deed/document.doc.html')!.async('string')).toBe('<p>Hi</p>')
  })
})

describe('names', () => {
  it('names an exported pdf the way the list names it', () => {
    expect(
      pdfPathFor('/Pure/PureDocuments/NZ company reg Limited 3.document', 'NZ company registration'),
    ).toBe('/Pure/PureDocuments/NZ company registration.pdf')
    // A slash in the label must not send the pdf into another folder.
    expect(pdfPathFor('/Pure/PureDocuments/A.document', 'Accounts / 2025')).toBe(
      '/Pure/PureDocuments/Accounts - 2025.pdf',
    )
  })

  it('puts the pdf beside the package, not inside it', () => {
    expect(pdfPathFor('/Pure/PureDocuments/Deed of Trust.document')).toBe(
      '/Pure/PureDocuments/Deed of Trust.pdf',
    )
    // A trailing slash on a folder path must not produce a stray segment.
    expect(pdfPathFor('/Pure/PureDocuments/Deed.document/')).toBe(
      '/Pure/PureDocuments/Deed.pdf',
    )
  })

  it('names the zip for what is in it', () => {
    expect(zipNameFor('Trust Admin', 1)).toBe('Trust Admin — 1 document.zip')
    expect(zipNameFor('Trust Admin', 3)).toBe('Trust Admin — 3 documents.zip')
    expect(zipNameFor('a/b:c', 2)).toBe('abc — 2 documents.zip')
  })
})

/**
 * Most of a project's papers are things somebody attached — accounts, returns,
 * scans. The first version only offered a checkbox on documents this app
 * wrote, which left the zip useless for exactly the projects that need one.
 */
describe('attached files, not only documents written here', () => {
  const links = [
    link('a', '/Pure/PureDocuments/Deed.document'),
    link('b', '/Pure/PureDocuments/2025_TaxReturn.pdf'),
    link('c', '/Pure/PureDocuments/2025 Accounts.xlsx'),
    link('d', 'https://example.com/tax', 'web'),
    link('e', 'mailto:x@example.com', 'mail'),
  ]

  it('offers everything with bytes, and nothing without', () => {
    expect(exportableDocuments(links).map(item => [item.name, item.kind])).toEqual([
      ['Deed', 'package'],
      ['2025_TaxReturn.pdf', 'file'],
      ['2025 Accounts.xlsx', 'file'],
    ])
  })

  it('only offers to convert what holds HTML', () => {
    expect(
      printableDocuments(exportableDocuments(links)).map(item => item.name),
    ).toEqual(['Deed'])
  })

  it('puts an attached file in as itself, not buried in a folder', async () => {
    const zip = await JSZip.loadAsync(
      await buildDocumentsZip([
        { name: 'Deed', kind: 'package', files: [{ name: 'document.doc.html', base64: btoa('<p>x</p>') }] },
        { name: '2025_TaxReturn.pdf', kind: 'file', files: [{ name: '2025_TaxReturn.pdf', base64: btoa('%PDF') }] },
      ]),
      { base64: true },
    )
    expect(Object.keys(zip.files)).toContain('Deed/document.doc.html')
    expect(Object.keys(zip.files)).toContain('2025_TaxReturn.pdf')
  })

  it('keeps the extension readable when two files share a name', async () => {
    // "Accounts (2).pdf", not "Accounts.pdf (2)".
    const zip = await JSZip.loadAsync(
      await buildDocumentsZip([
        { name: 'Accounts.pdf', kind: 'file', files: [{ name: 'Accounts.pdf', base64: btoa('a') }] },
        { name: 'Accounts.pdf', kind: 'file', files: [{ name: 'Accounts.pdf', base64: btoa('b') }] },
      ]),
      { base64: true },
    )
    expect(Object.keys(zip.files)).toContain('Accounts.pdf')
    expect(Object.keys(zip.files)).toContain('Accounts (2).pdf')
  })

  it('round-trips binary bytes rather than mangling them as text', async () => {
    const bytes = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))
    const zip = await JSZip.loadAsync(
      await buildDocumentsZip([
        { name: 'scan.png', kind: 'file', files: [{ name: 'scan.png', base64: bytes }] },
      ]),
      { base64: true },
    )
    expect(await zip.file('scan.png')!.async('base64')).toBe(bytes)
  })
})

/**
 * A zip of .doc.html files is no use to whoever it is sent to. Documents
 * written here are rendered to PDF on the way in; the HTML and the package
 * folder are the app's business, not the recipient's.
 */
describe('documents go into the zip as PDFs', () => {
  it('builds the pdf inside the package, hidden, so it can be cleared away', () => {
    expect(zipScratchPdfPath('/Pure/PureDocuments/Deed.document')).toBe(
      '/Pure/PureDocuments/Deed.document/.export.pdf',
    )
    // A folder path with a trailing slash must not produce a double slash.
    expect(zipScratchPdfPath('/Pure/PureDocuments/Deed.document/')).toBe(
      '/Pure/PureDocuments/Deed.document/.export.pdf',
    )
  })

  it('is a different place from the pdf an explicit export leaves behind', () => {
    // Export PDF writes one beside the package on purpose and keeps it; the
    // zip's copy is scratch. Sharing a path would make one delete the other.
    const pkg = '/Pure/PureDocuments/Deed.document'
    expect(zipScratchPdfPath(pkg)).not.toBe(pdfPathFor(pkg))
  })

  it('names the entry with the extension the recipient expects', async () => {
    const zip = await JSZip.loadAsync(
      await buildDocumentsZip([
        {
          name: 'Deed.pdf',
          kind: 'file',
          files: [{ name: 'Deed.pdf', base64: btoa('%PDF-1.4') }],
        },
      ]),
      { base64: true },
    )
    expect(Object.keys(zip.files)).toEqual(['Deed.pdf'])
    expect(Object.keys(zip.files).some(name => name.endsWith('.doc.html'))).toBe(false)
  })
})

/**
 * The name on disk drifts from the name on screen: a collision suffix from
 * when the file was made, or a label renamed since. The archive should read
 * the way the app reads.
 */
describe('export names come from the list, not the filesystem', () => {
  it('uses the label a person sees, not the folder name', () => {
    const links = [
      {
        id: 'a',
        label: 'NZ company registration',
        path: '/Pure/PureDocuments/NZ company registration Limited 3.document',
        kind: 'document' as const,
      },
    ]
    expect(exportableDocuments(links).map(item => item.name)).toEqual([
      'NZ company registration',
    ])
  })

  it('keeps a file’s extension whatever the label says', () => {
    // Relabel a PDF "Tax return" and it must still arrive as a .pdf, or
    // nothing on the other end will open it.
    expect(exportNameFor('Tax return', '2025_TaxReturn.pdf', false)).toBe(
      'Tax return.pdf',
    )
    // …and must not double it when the label already carries one.
    expect(exportNameFor('Tax return.pdf', '2025_TaxReturn.pdf', false)).toBe(
      'Tax return.pdf',
    )
    expect(exportNameFor('TAX RETURN.PDF', '2025_TaxReturn.pdf', false)).toBe(
      'TAX RETURN.PDF',
    )
  })

  it('falls back to the name on disk when a label is blank', () => {
    expect(exportNameFor('   ', 'Deed.document', true)).toBe('Deed.document')
  })

  it('does not let a label become a folder inside the archive', () => {
    // A slash in free text would silently nest the entry.
    expect(exportNameFor('Accounts / 2025', 'a.pdf', false)).toBe(
      'Accounts - 2025.pdf',
    )
  })
})
