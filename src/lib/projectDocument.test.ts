import { describe, expect, it, vi } from 'vitest'
import {
  createDocumentPackage,
  documentNameFromPath,
  initialDocumentHtml,
  isDocumentPackage,
  readDocumentHtml,
  renameDocumentPackage,
  safeDocumentName,
  writeDocumentHtml,
  type DocumentIo,
} from './projectDocument'

function makeIo(): DocumentIo & { drafts: unknown[]; saved: unknown[] } {
  const drafts: unknown[] = []
  const saved: unknown[] = []
  return {
    drafts,
    saved,
    createDraft: vi.fn(async (request: { title?: string }) => {
      drafts.push(request)
      return { path: `/Users/developer/Pure/PureDrafts/${request.title}.document` }
    }),
    autosave: vi.fn(async (request: unknown) => {
      saved.push(request)
      return { savedAt: '2026-08-25T00:00:00.000Z' }
    }),
    rename: vi.fn(async (request: { title: string }) => ({
      path: `/Users/developer/Pure/PureDrafts/${request.title}.document`,
    })),
    readTextFile: vi.fn(async () => '<h1>Notes</h1>'),
  }
}

describe('safeDocumentName', () => {
  it('strips characters that would nest or hide the package', () => {
    expect(safeDocumentName('Trust/Admin: notes')).toBe('Trust Admin notes')
    expect(safeDocumentName('  ..hidden  ')).toBe('hidden')
    expect(safeDocumentName('   ')).toBe('Untitled document')
  })
})

describe('createDocumentPackage', () => {
  it('creates through the documents service, never by writing paths itself', async () => {
    const io = makeIo()
    const created = await createDocumentPackage(io, { title: 'Trust deed notes' })

    expect(io.createDraft).toHaveBeenCalledWith({
      appSlug: 'writer',
      suffix: '.document',
      kind: 'package',
      title: 'Trust deed notes',
      files: [
        {
          name: 'document.json',
          content: `${JSON.stringify({ title: 'Trust deed notes' }, null, 2)}\n`,
        },
        { name: 'document.doc.html', content: expect.stringContaining('<h1>') },
      ],
    })
    expect(created.name).toBe('Trust deed notes')
  })

  it('takes the name from the path the service returns, not the title asked for', async () => {
    const io = makeIo()
    io.createDraft = vi.fn(async () => ({
      path: '/Users/developer/Pure/PureDrafts/Notes 2.document',
    }))
    const created = await createDocumentPackage(io, { title: 'Notes' })
    // The service uniquifies; assuming our own title would mislabel the link.
    expect(created.name).toBe('Notes 2')
  })

  it('uses supplied html when an agent provides it', async () => {
    const io = makeIo()
    await createDocumentPackage(io, { title: 'Brief', html: '<p>From an agent</p>' })
    const request = io.drafts[0] as { files: { content: string }[] }
    expect(request.files[1]?.content).toBe('<p>From an agent</p>')
  })

  it('escapes the title in the seeded html', () => {
    expect(initialDocumentHtml('Tom & <Jerry>')).toContain('Tom &amp; &lt;Jerry&gt;')
  })
})

describe('reading and saving', () => {
  it('reads the package content file', async () => {
    const io = makeIo()
    await readDocumentHtml(io, '/Users/developer/Pure/PureDrafts/Notes.document')
    expect(io.readTextFile).toHaveBeenCalledWith(
      '/Users/developer/Pure/PureDrafts/Notes.document/document.doc.html',
    )
  })

  it('saves through autosave, addressing the file inside the package', async () => {
    const io = makeIo()
    await writeDocumentHtml(io, '/Users/developer/Pure/PureDrafts/Notes.document', '<p>Hi</p>')
    expect(io.autosave).toHaveBeenCalledWith({
      path: '/Users/developer/Pure/PureDrafts/Notes.document',
      files: [{ name: 'document.doc.html', content: '<p>Hi</p>' }],
    })
  })
})

describe('renameDocumentPackage', () => {
  it('renames through the service and reports the new path', async () => {
    const io = makeIo()
    const renamed = await renameDocumentPackage(
      io,
      '/Users/developer/Pure/PureDrafts/Old.document',
      'New name',
    )
    expect(io.rename).toHaveBeenCalledWith({
      path: '/Users/developer/Pure/PureDrafts/Old.document',
      title: 'New name',
      suffix: '.document',
      appSlug: 'writer',
    })
    expect(renamed.name).toBe('New name')
  })
})

describe('path helpers', () => {
  it('recognises packages and recovers their names', () => {
    expect(isDocumentPackage('/x/a.document')).toBe(true)
    expect(isDocumentPackage('/x/a.book')).toBe(false)
    expect(documentNameFromPath('/x/Trust deed.document')).toBe('Trust deed')
  })
})
