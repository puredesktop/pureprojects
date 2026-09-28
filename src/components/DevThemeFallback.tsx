import { createGlobalStyle } from 'styled-components'
import { lightTheme } from '@purescience/platform-ui/theme/themes/light'
import { darkTheme } from '@purescience/platform-ui/theme/themes/dark'
import { themeToRootCssBlock } from '@purescience/platform-ui/theme/utils/cssVariables'

// Standalone previews follow the system; a desktop theme always takes precedence.
const fallback = (theme: typeof lightTheme) =>
  themeToRootCssBlock(theme, ':root:not([data-platform-theme])')

export const DevThemeFallback = createGlobalStyle`
  ${fallback(lightTheme)}
  :root:not([data-platform-theme]) { color-scheme: light; }
  @media (prefers-color-scheme: dark) {
    ${fallback(darkTheme)}
    :root:not([data-platform-theme]) { color-scheme: dark; }
  }
  body {
    margin: 0;
    font-family: var(--platform-typography-font-family);
    background: var(--platform-colors-bg);
    color: var(--platform-colors-text);
  }
`
