import type { Extensions } from '@tiptap/react'
import { openHeadlessDocument } from '@purescience/platform-editor'

/**
 * Block-level edits to a stored document, without mounting an editor.
 *
 * Agents used to be able to create a document and never touch it again: the
 * only write was the initial HTML. Handing them the whole file to rewrite
 * would mean every small change risks the rest of it, so edits go through the
 * same schema the reader mounts — parse, operate, serialize. A block the
 * schema does not accept cannot be written, and the blocks an agent is told
 * about are the blocks it can address.
 */
export interface DocumentBlock {
  index: number
  /** paragraph, heading, bulletList, mermaidBlock… */
  type: string
  preview: string
  detail?: Record<string, unknown>
}

export type BlockPosition =
  | { at: 'end' }
  | { at: 'before'; index: number }
  | { at: 'after'; index: number }

export function readDocumentBlocks(
  extensions: Extensions,
  html: string,
): DocumentBlock[] {
  return openHeadlessDocument(extensions, html).listBlocks()
}

export function insertDocumentBlock(
  extensions: Extensions,
  html: string,
  markup: string,
  position: BlockPosition,
): string | null {
  const doc = openHeadlessDocument(extensions, html)
  if (!doc.insertBlock(markup, position)) return null
  return doc.toHTML()
}

export function replaceDocumentBlock(
  extensions: Extensions,
  html: string,
  index: number,
  markup: string,
): string | null {
  const doc = openHeadlessDocument(extensions, html)
  if (!doc.replaceBlock(index, markup)) return null
  return doc.toHTML()
}

export function deleteDocumentBlock(
  extensions: Extensions,
  html: string,
  index: number,
): string | null {
  const doc = openHeadlessDocument(extensions, html)
  if (!doc.deleteBlock(index)) return null
  return doc.toHTML()
}

/**
 * A Mermaid diagram as markup the editor will parse into its diagram block.
 *
 * The `figure[data-type="mermaid"]` shape, not the bare
 * `pre > code.language-mermaid` one: MermaidBlock claims both, but so does the
 * syntax-highlighting code block, which wins the plain `pre > code` and turns
 * a diagram into a listing of its own source.
 */
export function mermaidBlockHtml(code: string): string {
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<figure data-type="mermaid" class="mermaid-block"><pre><code class="language-mermaid">${escaped}</code></pre></figure>`
}
