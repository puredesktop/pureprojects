import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { installProjectsAppearance, ProjectsWhiteNeutral } from './projectsAppearance'

installProjectsAppearance()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ProjectsWhiteNeutral />
    <App />
  </StrictMode>,
)
