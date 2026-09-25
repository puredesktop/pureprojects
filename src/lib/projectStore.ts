import { PROJECTS_STORE_FILE } from '../constants'
import { emptyStore, parseStore } from './projectModel'
import type { ProjectsStore } from '../types'

/** The bridge slice the store needs; injected so tests run without one. */
export interface ProjectStorageIo {
  readJson(
    fileName: `${string}.json`,
  ): Promise<{ value: unknown; version: string | null }>
  writeJson(
    fileName: `${string}.json`,
    value: unknown,
    ifMatch: string | null,
  ): Promise<{ ok: boolean; conflict?: boolean }>
}

/**
 * Reads and writes the whole project store through the app's slug-scoped
 * JSON storage, holding the version it last read so a concurrent write from
 * another window conflicts rather than clobbering. On conflict the caller's
 * change is re-applied to the freshly read store and retried once — the
 * edits here are small and independent, so a merge-by-reapply is honest.
 */
export class ProjectStore {
  private version: string | null = null

  constructor(private readonly io: ProjectStorageIo) {}

  async load(): Promise<ProjectsStore> {
    const { value, version } = await this.io.readJson(PROJECTS_STORE_FILE)
    this.version = version
    return parseStore(value)
  }

  /**
   * Apply `mutate` to the current store and persist it. Returns the store
   * as written, so callers render exactly what landed on disk.
   */
  async update(
    mutate: (store: ProjectsStore) => ProjectsStore,
  ): Promise<ProjectsStore> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { value, version } = await this.io.readJson(PROJECTS_STORE_FILE)
      this.version = version
      const next = mutate(parseStore(value) ?? emptyStore())
      const result = await this.io.writeJson(PROJECTS_STORE_FILE, next, version)
      if (result.ok) return next
    }
    throw new Error('the project store changed twice mid-write — try again')
  }
}
