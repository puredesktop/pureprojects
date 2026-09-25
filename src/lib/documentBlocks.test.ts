// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { buildExtensions } from '@purescience/platform-editor'
import {
  deleteDocumentBlock,
  insertDocumentBlock,
  mermaidBlockHtml,
  readDocumentBlocks,
  replaceDocumentBlock,
} from './documentBlocks'

const extensions = buildExtensions()
const doc = '<h1>Deed</h1><p>First.</p><p>Second.</p>'

/**
 * Agents could create a document and never touch it again. These are the edits
 * that let them come back to one — addressed by block, through the same schema
 * the reader mounts, so a change cannot put anything in the file that the
 * editor would then refuse to show.
 */
describe('reading a document as blocks', () => {
  it('numbers the blocks an agent can address, with what is in them', () => {
    const blocks = readDocumentBlocks(extensions, doc)
    expect(blocks.map(block => [block.index, block.type, block.preview])).toEqual([
      [0, 'heading', 'Deed'],
      [1, 'paragraph', 'First.'],
      [2, 'paragraph', 'Second.'],
    ])
  })

  it('says what kind of heading, so an agent need not guess the level', () => {
    expect(readDocumentBlocks(extensions, doc)[0].detail).toEqual({ level: 1 })
  })
})

describe('editing by block', () => {
  it('adds at the end, before, and after', () => {
    const atEnd = insertDocumentBlock(extensions, doc, '<p>Third.</p>', { at: 'end' })
    expect(atEnd).toContain('Third.')
    expect(readDocumentBlocks(extensions, atEnd!)).toHaveLength(4)

    const before = insertDocumentBlock(extensions, doc, '<p>Nought.</p>', {
      at: 'before',
      index: 1,
    })
    expect(readDocumentBlocks(extensions, before!)[1].preview).toBe('Nought.')

    const after = insertDocumentBlock(extensions, doc, '<p>Middle.</p>', {
      at: 'after',
      index: 1,
    })
    expect(readDocumentBlocks(extensions, after!)[2].preview).toBe('Middle.')
  })

  it('replaces one block and leaves its neighbours alone', () => {
    const next = replaceDocumentBlock(extensions, doc, 1, '<p>Rewritten.</p>')
    expect(readDocumentBlocks(extensions, next!).map(b => b.preview)).toEqual([
      'Deed',
      'Rewritten.',
      'Second.',
    ])
  })

  it('deletes one block and leaves its neighbours alone', () => {
    const next = deleteDocumentBlock(extensions, doc, 1)
    expect(readDocumentBlocks(extensions, next!).map(b => b.preview)).toEqual([
      'Deed',
      'Second.',
    ])
  })

  it('refuses an index that is not there rather than writing something else', () => {
    // Returning null lets the caller report it; silently editing block 0
    // because 9 was out of range is how an agent damages a document.
    expect(replaceDocumentBlock(extensions, doc, 9, '<p>x</p>')).toBeNull()
    expect(deleteDocumentBlock(extensions, doc, 9)).toBeNull()
    expect(
      insertDocumentBlock(extensions, doc, '<p>x</p>', { at: 'after', index: 9 }),
    ).toBeNull()
  })
})

describe('diagrams', () => {
  it('writes markup the editor parses as a diagram, not as code', () => {
    const html = insertDocumentBlock(
      extensions,
      doc,
      mermaidBlockHtml('graph TD;\n  A[Start] --> B[Finish];'),
      { at: 'end' },
    )
    const blocks = readDocumentBlocks(extensions, html!)
    expect(blocks.at(-1)?.type).toBe('mermaidBlock')
  })

  it('escapes diagram source so an arrow cannot close the tag', () => {
    // `A --> B` contains a > ; unescaped it ends <code> early and the rest of
    // the diagram becomes document text.
    const markup = mermaidBlockHtml('graph TD; A --> B;')
    expect(markup).toContain('--&gt;')
    expect(markup).not.toContain('--> B;</code>')
  })
})
