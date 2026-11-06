
/**
 * Projects' two backgrounds, in light mode (as in Mail):
 * - Glass is the shared White look (solid, softly tinted surfaces), which reads
 *   better here than frosted panels over a wallpaper.
 * - White is plain neutral greys, clearly different from Glass.
 *
 * The shared frame writes the saved choice to `data-platform-appearance`. Here
 * the choice is kept in `data-projects-appearance`, and in light mode the document
 * is always rendered as White, so Glass gets every shared White style exactly;
 * the neutral greys below apply only when White itself was chosen. Dark mode is
 * left as the frame sets it.
 */
export function installProjectsAppearance(root: HTMLElement = document.documentElement): () => void {
  let chosen: string | null = root.getAttribute('data-platform-appearance')
  let ownWrites = 0

  const render = () => {
    if (chosen) root.setAttribute('data-projects-appearance', chosen)
    else root.removeAttribute('data-projects-appearance')
    const dark = root.getAttribute('data-platform-theme') === 'dark'
    const want = chosen && !dark ? 'white' : chosen
    if (root.getAttribute('data-platform-appearance') === want) return
    ownWrites += 1
    if (want) root.setAttribute('data-platform-appearance', want)
    else root.removeAttribute('data-platform-appearance')
  }

  const observer = new MutationObserver(records => {
    let changed = false
    for (const record of records) {
      if (record.attributeName === 'data-platform-theme') changed = true
      if (record.attributeName !== 'data-platform-appearance') continue
      if (ownWrites > 0) {
        ownWrites -= 1
        continue
      }
      chosen = root.getAttribute('data-platform-appearance')
      changed = true
    }
    if (changed) render()
  })
  observer.observe(root, { attributes: true, attributeFilter: ['data-platform-appearance', 'data-platform-theme'] })
  render()
  return () => observer.disconnect()
}
