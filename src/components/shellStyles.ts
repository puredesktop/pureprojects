import styled, { css } from 'styled-components'
import type { ProjectStatus } from '../types'

/**
 * Chrome for PureProjects. Values come from the platform theme via
 * `--platform-*` variables — the app never hardcodes a palette, so it
 * follows light/dark and any surface palette the shell sets. The one
 * app-owned token is the identity accent, scoped as `--projects-accent`
 * rather than overriding `--platform-colors-accent`, which belongs to
 * theme meaning (see packages/ui `appAccents.ts`).
 */
/**
 * Marks an element for the platform chrome stylesheet (theme/chromeCss in
 * @purescience/platform-ui): toolbars, fields, sidebars, list rows and
 * meta get their measures, faces and theme colours from the
 * --pure-chrome-* tokens. Typed loosely on purpose: styled-components'
 * attrs rejects data-* literals.
 */
export const chrome = (
  kind: string,
  extra: Record<string, string> = {},
): Record<string, string> => ({ 'data-chrome': kind, ...extra })

export const Shell = styled.div`
  --projects-accent: var(--pure-chrome-accent);
  --projects-accent-text: var(--app-text, var(--pure-chrome-accent));
  --projects-line: var(--pure-chrome-line);

  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--platform-colors-bg);
  color: var(--platform-colors-text);
  font-size: var(--platform-typography-font-size-base, 14.5px);
`

/** The list's control row: search, sort, New — the platform toolbar. */
export const Toolbar = styled.div.attrs(chrome('toolbar'))`
  gap: 16px;
  padding: 0 var(--pure-chrome-inset);
`

export const Search = styled.input.attrs(chrome('field'))`
  width: 292px;
`

export const SortSelect = styled.select.attrs(chrome('toolbar-select'))`
  color: var(--platform-colors-text-secondary);
  cursor: pointer;

  &:hover {
    color: var(--platform-colors-text);
  }
`

export const Spacer = styled.span`
  flex: 1;
`

export const Body = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`

/** A section label: the platform's mono, tracked, uppercase. */
export const Kicker = styled.div`
  padding: 0 var(--pure-chrome-inset) 6px;
  font-family: var(--platform-typography-font-family-mono);
  font-size: var(--pure-chrome-label-size);
  font-weight: 500;
  letter-spacing: var(--pure-chrome-label-tracking);
  text-transform: uppercase;
  color: var(--pure-chrome-muted);
`

export const Main = styled.main`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
`

export const Scroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`

const rowGrid = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px minmax(0, 300px) 116px 104px;
  gap: 16px;
  align-items: center;
  min-height: var(--pure-chrome-list-row-height);
  padding: 8px var(--pure-chrome-inset);
`

export const HeaderRow = styled.div`
  ${rowGrid};
  min-height: 0;
  padding-top: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--projects-line);
  background: var(--pure-chrome-bar);
  font-family: var(--platform-typography-font-family-mono);
  font-size: var(--pure-chrome-label-size);
  font-weight: 500;
  letter-spacing: var(--pure-chrome-label-tracking);
  text-transform: uppercase;
  color: var(--pure-chrome-muted);
`

export const Row = styled.button<{
  $selected?: boolean
  $dropBefore?: boolean
  $dropAfter?: boolean
  $dragging?: boolean
}>`
  ${rowGrid};
  position: relative;
  width: 100%;
  opacity: ${({ $dragging }) => ($dragging ? 0.4 : 1)};
  box-shadow: ${({ $dropBefore, $dropAfter }) =>
    $dropBefore
      ? 'inset 0 2px 0 var(--projects-accent)'
      : $dropAfter
        ? 'inset 0 -2px 0 var(--projects-accent)'
        : 'none'};
  border: 0;
  border-bottom: 1px solid var(--projects-line);
  background: ${({ $selected }) =>
    $selected ? 'var(--pure-chrome-selection)' : 'var(--pure-chrome-paper)'};
  color: inherit;
  font: inherit;
  font-size: var(--pure-chrome-ui-size);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--pure-chrome-hover);
  }
`

/**
 * The left edge of a row is the grip. No handle is drawn — a handle is a
 * widget to find and aim at, and the row's left margin is already dead space.
 * The cursor is the only tell, which is enough once you have grabbed one.
 */
export const DragZone = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 26px;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
`

export const RowTitle = styled.div`
  font-size: var(--pure-chrome-ui-size);
  font-weight: 500;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const RowMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--platform-colors-text-secondary);
  font-size: var(--pure-chrome-ui-size);
`

export const Cell = styled.div<{ $tone?: 'default' | 'muted' | 'warn' | 'danger' }>`
  min-width: 0;
  font-size: var(--platform-typography-font-size-sm, 13px);
  line-height: 1.4;
  color: ${({ $tone }) =>
    $tone === 'muted'
      ? 'var(--platform-colors-text-disabled)'
      : $tone === 'warn'
        ? 'var(--platform-colors-semantic-orange-text)'
        : $tone === 'danger'
          ? 'var(--platform-colors-semantic-red-text)'
          : 'var(--platform-colors-text-secondary)'};
`

/** One wait, one line — truncated rather than wrapped, so a long "what"
 * cannot push the rest of the row out of shape. */
export const WaitLine = styled.div`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const Mono = styled.span.attrs(chrome('meta'))``

const STATUS_TONE: Record<ProjectStatus, { bg: string; fg: string }> = {
  idea: {
    bg: 'var(--platform-colors-surface-hover, #eaeaee)',
    fg: 'var(--platform-colors-text-secondary)',
  },
  active: {
    bg: 'var(--platform-colors-semantic-blue-muted, #e8f0fb)',
    fg: 'var(--platform-colors-semantic-blue-text, #244f87)',
  },
  waiting: {
    bg: 'var(--platform-colors-semantic-orange-muted, #f3e5c8)',
    fg: 'var(--platform-colors-semantic-orange-text, #7a5114)',
  },
  done: {
    bg: 'var(--platform-colors-semantic-green-muted, #eef7f1)',
    fg: 'var(--platform-colors-semantic-green-text, #16683f)',
  },
}

export const StatusChip = styled.span<{ $status: ProjectStatus; $overdue?: boolean }>`
  display: inline-block;
  flex: none;
  padding: 2px 7px;
  border-radius: 4px;
  background: ${({ $status, $overdue }) =>
    $overdue ? 'var(--platform-colors-semantic-red-muted, #f4dfdc)' : STATUS_TONE[$status].bg};
  color: ${({ $status, $overdue }) =>
    $overdue ? 'var(--platform-colors-semantic-red-text, #8a2d24)' : STATUS_TONE[$status].fg};
  font-size: var(--pure-chrome-label-size);
  letter-spacing: var(--pure-chrome-label-tracking);
  text-transform: uppercase;
`

export const Bar = styled.span`
  display: block;
  width: 68px;
  height: 4px;
  background: var(--projects-line);
`

export const BarFill = styled.span<{ $ratio: number; $tone?: 'accent' | 'done' }>`
  display: block;
  height: 4px;
  width: ${({ $ratio }) => Math.round(Math.max(0, Math.min(1, $ratio)) * 68)}px;
  background: ${({ $tone }) =>
    $tone === 'done'
      ? 'var(--platform-colors-semantic-green, #1f8a55)'
      : 'var(--projects-accent)'};
`

/** The status line under the list: mono meta on the chrome bar. */
export const Footer = styled.div.attrs(chrome('meta'))`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  padding: 10px var(--pure-chrome-inset);
  border-top: 1px solid var(--projects-line);
  background: var(--pure-chrome-bar);
`

export const Button = styled.button<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: var(--pure-chrome-control-height);
  padding: 0 10px;
  border: 1px solid
    ${({ $primary }) =>
      $primary ? 'var(--pure-chrome-accent)' : 'var(--platform-colors-border-strong)'};
  border-radius: 7px;
  background: ${({ $primary }) =>
    $primary ? 'var(--pure-chrome-accent)' : 'var(--pure-chrome-surface)'};
  color: ${({ $primary }) =>
    $primary ? 'var(--pure-chrome-on-accent)' : 'var(--platform-colors-text)'};
  font: inherit;
  font-size: var(--platform-typography-font-size-sm, 13px);
  cursor: pointer;

  &:hover {
    filter: ${({ $primary }) => ($primary ? 'brightness(0.94)' : 'none')};
    background: ${({ $primary }) =>
      $primary ? 'var(--pure-chrome-accent)' : 'var(--pure-chrome-hover)'};
  }
`

export const Attention = styled.span<{ $tone: 'warn' | 'danger' }>`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: ${({ $tone }) =>
    $tone === 'danger'
      ? 'var(--platform-colors-semantic-red-text, #8a2d24)'
      : 'var(--platform-colors-semantic-orange-text, #7a5114)'};
  font-size: var(--platform-typography-font-size-sm, 13px);
`

export const AttentionDot = styled.span<{ $tone: 'warn' | 'danger' }>`
  width: 6px;
  height: 6px;
  background: ${({ $tone }) =>
    $tone === 'danger'
      ? 'var(--platform-colors-semantic-red, #b23a2e)'
      : 'var(--platform-colors-semantic-orange, #c98a2b)'};
`
