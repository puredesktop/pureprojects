import type { ProjectLink } from '../types'

/**
 * A project's links point at two different kinds of thing: resources in
 * the workspace (a document package, a mail thread, an event) and pages
 * on the web. They are stored in one list because to the user they are
 * one list — the reference material for this project — but they open by
 * completely different routes, so what a link IS has to be knowable
 * from the record rather than guessed at the click.
 */

/** A pasted target, once we know what it is. */
export type LinkTarget =
  | { kind: 'web'; path: string; label: string }
  | { kind: 'document'; path: string; label: string }

/**
 * Reads what the user pasted. Accepts a full URL, a bare host with a
 * path (`docs.google.com/document/d/…`), or a workspace path. Returns
 * null for anything that is neither — an empty box or a stray word.
 */
export function parseLinkTarget(raw: string): LinkTarget | null {
  const text = raw.trim()
  if (!text) return null

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    // Only web schemes are handed to the browser; file:// and friends
    // are workspace business and never open externally.
    if (!/^https?:\/\//i.test(text)) return null
    const url = safeUrl(text)
    return url ? { kind: 'web', path: url.toString(), label: linkHost(url.toString()) } : null
  }

  // A bare host is only a URL if it actually looks like one: a dot, no
  // spaces, and a recognisable label after the last dot.
  if (!text.includes(' ') && /^[\w-]+(\.[\w-]+)+(\/|$|\?|#)/.test(text)) {
    const url = safeUrl(`https://${text}`)
    if (url) return { kind: 'web', path: url.toString(), label: linkHost(url.toString()) }
  }

  if (text.startsWith('/') || text.includes('/')) {
    return { kind: 'document', path: text, label: fileLabel(text) }
  }
  return null
}

function safeUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.hostname ? url : null
  } catch {
    return null
  }
}

/** `docs.google.com` — what a link says about itself at a glance. */
export function linkHost(url: string): string {
  const parsed = safeUrl(url)
  return parsed ? parsed.hostname.replace(/^www\./, '') : url
}

function fileLabel(path: string): string {
  const name = path.replace(/\/+$/, '').split('/').pop() ?? path
  return name.replace(/\.[^.]+$/, '') || path
}

/**
 * Web links stored before `kind: 'web'` existed carry `kind: 'document'`
 * with an http path, so the path is the authority and the kind is the
 * hint — never the other way round.
 */
export function isWebLink(link: Pick<ProjectLink, 'kind' | 'path'>): boolean {
  return link.kind === 'web' || /^https?:\/\//i.test(link.path)
}

/** The muted tag on a link row: its host, or what kind of resource it is. */
export function linkMeta(link: Pick<ProjectLink, 'kind' | 'path'>): string {
  return isWebLink(link) ? linkHost(link.path) : link.kind
}
