import { PROJECTS_STORE_VERSION } from '../constants'
import type { ProjectsStore } from '../types'

/** Standalone development starts with an empty workspace, just like a new installation. */
export function devSampleStore(_now = new Date()): ProjectsStore {
  return { storeVersion: PROJECTS_STORE_VERSION, projects: [] }
}
export function devSampleWorkspace(rootPath: string): {
  rootPath: string; parentPath: string | null;
  entries: Array<{ path: string; name: string; extension: string;
    kind: 'folder' | 'document' | 'image' | 'other'; mimeType: string;
    byteLength: number; modifiedAt: string; isDirectory: boolean }>;
} {
  return { rootPath, parentPath: null, entries: [] }
}
