import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './compact-in-room.css'
import { installProjectsAppearance } from './projectsAppearance'
import { ProjectsStyles } from './ui/styles'

installProjectsAppearance()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ProjectsStyles />
    <App />
  </StrictMode>,
)
