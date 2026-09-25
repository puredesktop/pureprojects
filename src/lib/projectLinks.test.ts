import { describe, expect, it } from 'vitest'
import { isWebLink, linkHost, linkMeta, parseLinkTarget } from './projectLinks'

describe('reading what was pasted', () => {
  it('takes a full URL and labels it by host', () => {
    expect(parseLinkTarget('https://www.ird.govt.nz/trusts')).toEqual({
      kind: 'web',
      path: 'https://www.ird.govt.nz/trusts',
      label: 'ird.govt.nz',
    })
  })

  it('promotes a bare host to https', () => {
    const target = parseLinkTarget('docs.google.com/document/d/abc')
    expect(target).toMatchObject({ kind: 'web', label: 'docs.google.com' })
    expect(target!.path.startsWith('https://')).toBe(true)
  })

  it('refuses schemes that are not the web', () => {
    expect(parseLinkTarget('file:///Users/developer/secrets.txt')).toBeNull()
    expect(parseLinkTarget('javascript:alert(1)')).toBeNull()
    expect(parseLinkTarget('purescience://open/thing')).toBeNull()
  })

  it('reads a workspace path as a document, named by its file', () => {
    expect(parseLinkTarget('/Users/developer/Pure/Trust.canvas')).toEqual({
      kind: 'document',
      path: '/Users/developer/Pure/Trust.canvas',
      label: 'Trust',
    })
  })

  it('returns null for what is neither', () => {
    expect(parseLinkTarget('   ')).toBeNull()
    expect(parseLinkTarget('just some words')).toBeNull()
  })
})

describe('classifying a stored link', () => {
  it('trusts the path over the kind, so older entries still open right', () => {
    // written before `web` existed
    expect(isWebLink({ kind: 'document', path: 'https://example.com' })).toBe(true)
    expect(isWebLink({ kind: 'web', path: 'https://example.com' })).toBe(true)
    expect(isWebLink({ kind: 'document', path: '/Users/developer/a.canvas' })).toBe(false)
  })

  it('tags a row with its host, or with what kind of resource it is', () => {
    expect(linkMeta({ kind: 'web', path: 'https://www.gov.uk/x' })).toBe('gov.uk')
    expect(linkMeta({ kind: 'document', path: '/a/b.canvas' })).toBe('document')
    expect(linkHost('not a url')).toBe('not a url')
  })
})
