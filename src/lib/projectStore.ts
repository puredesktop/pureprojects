import { PROJECTS_STORE_FILE } from '../constants'
import { parseStore } from './projectModel'
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
 * JSON storage, serializing local edits and reading the current version so a write from
 * another window conflicts rather than clobbering. On conflict the caller's
 * change is re-applied to the freshly read store and retried once — the
 * edits here are small and independent, so a merge-by-reapply is honest.
 */
export class ProjectStore {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly io: ProjectStorageIo) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    // A failed write must not poison subsequent edits or reads.
    this.queue = result.catch(() => undefined)
    return result
  }

  load(): Promise<ProjectsStore> {
    return this.enqueue(async () => {
      const { value } = await this.io.readJson(PROJECTS_STORE_FILE)
      return parseStore(value)
    })
  }

  /**
   * Apply `mutate` to the current store and persist it. Returns the store
   * as written, so callers render exactly what landed on disk.
   */
  update(
    mutate: (store: ProjectsStore) => ProjectsStore,
  ): Promise<ProjectsStore> {
    return this.enqueue(async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { value, version } = await this.io.readJson(PROJECTS_STORE_FILE)
        const next = mutate(parseStore(value))
        const result = await this.io.writeJson(
          PROJECTS_STORE_FILE,
          next,
          version,
        )
        if (result.ok) return next
        if (!result.conflict)
          throw new Error('the project store could not be saved')
      }
      throw new Error('the project store changed twice mid-write — try again')
    })
  }
}
