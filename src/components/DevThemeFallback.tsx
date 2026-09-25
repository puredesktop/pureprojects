import { createGlobalStyle } from 'styled-components'

/**
 * DEV ONLY. Inside PureDesktop the shell publishes the whole
 * `--platform-*` token set through the bridge, and AppFrame applies it.
 * Opened in a plain browser tab there is no shell, so every token is
 * undefined and platform-ui components (Modal above all) paint with
 * `background: var(--platform-colors-elevated)` resolving to nothing —
 * a transparent dialog.
 *
 * These are the light theme's real resolved values from
 * `packages/ui/src/theme/themes/light.ts`, applied only when no theme
 * arrived. The shell's own values land on the same custom properties and
 * take over the moment the bridge answers, so this can never fight the
 * real theme in production.
 */
export const DevThemeFallback = createGlobalStyle`
  :root {
    --platform-colors-bg: #fbfbfc;
    --platform-colors-surface: #f8f8fa;
    --platform-colors-surface-hover: #eaeaee;
    --platform-colors-surface-active: #eaeaee;
    --platform-colors-elevated: #ffffff;
    --platform-colors-text: #1b1b1e;
    --platform-colors-text-secondary: #3a3a3e;
    --platform-colors-text-disabled: #9a9aa0;
    --platform-colors-text-inverse: #ffffff;
    --platform-colors-accent: #1b1b1e;
    --platform-colors-accent-hover: #1b1b1e;
    --platform-colors-accent-muted: #eaeaee;
    --platform-colors-border: #e5e5e9;
    --platform-colors-border-strong: #dadade;
    --platform-colors-divider: #e5e5e9;
    --platform-colors-danger: #b23a2e;
    --platform-colors-text-danger: #b23a2e;
    --platform-colors-semantic-blue: #3b6fb0;
    --platform-colors-semantic-blue-text: #244f87;
    --platform-colors-semantic-blue-muted: #e8f0fb;
    --platform-colors-semantic-blue-border: #b9cbe4;
    --platform-colors-semantic-orange: #c98a2b;
    --platform-colors-semantic-orange-text: #7a5114;
    --platform-colors-semantic-orange-muted: #f3e5c8;
    --platform-colors-semantic-orange-border: #e3c98f;
    --platform-colors-semantic-green: #1f8a55;
    --platform-colors-semantic-green-text: #16683f;
    --platform-colors-semantic-green-muted: #eef7f1;
    --platform-colors-semantic-red: #b23a2e;
    --platform-colors-semantic-red-text: #8a2d24;
    --platform-colors-semantic-red-muted: #f4dfdc;
    --platform-colors-semantic-red-border: #dfb7b1;
    --platform-colors-focus: #1b1b1e;
    --platform-typography-font-family: "Archivo", system-ui, -apple-system, sans-serif;
    --platform-typography-font-family-mono: "JetBrains Mono", ui-monospace, monospace;
    --platform-typography-font-size-base: 14.5px;
    --platform-typography-font-size-xs: 11px;
    --platform-typography-font-size-sm: 13px;
    --platform-typography-font-size-lg: 17px;
    --platform-typography-font-size-xl: 24px;
    --platform-spacing-xs: 4px;
    --platform-spacing-sm: 8px;
    --platform-spacing-md: 12px;
    --platform-spacing-lg: 16px;
    --platform-spacing-xl: 24px;
    --platform-radius-sm: 0px;
    --platform-radius-md: 0px;
    --platform-radius-lg: 0px;
  }

  body {
    margin: 0;
    font-family: var(--platform-typography-font-family);
    background: var(--platform-colors-bg);
    color: var(--platform-colors-text);
  }
`
