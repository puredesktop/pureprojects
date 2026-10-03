import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'
import { appDevServerFromManifest } from '../../scripts/vite/app-server.mjs'

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom', 'styled-components'] },
  plugins: [
    react({
      resolve: { dedupe: ['react', 'react-dom', 'styled-components'] },
  plugins: [['@swc/plugin-styled-components', { displayName: true, fileName: true }]],
    }),
  ],
  server: appDevServerFromManifest(import.meta.url),
})
