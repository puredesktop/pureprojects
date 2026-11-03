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
  ): Promise<{ ok: boolean; conflict?: boolean; version?: string | null }>
}

const WRITE_ATTEMPTS = 12

/**
 * Reads and writes the whole project store through the app's slug-scoped
 * JSON storage, serializing local edits and reading the current version so a write from
 * another window conflicts rather than clobbering. On conflict the caller's
 * change is re-applied to the freshly read store and tried again — the edits
 * here are small and independent, so a merge-by-reapply is honest. Two copies
 * of the app (a tab and one held in a page) can make those conflicts ordinary,
 * so it goes round as often as it takes, waiting a little longer each time.
 */
export class ProjectStore {
  private queue: Promise<unknown> = Promise.resolve()
  /** The version this copy last read or wrote: a look that finds it still there has found nothing new. */
  private seen: string | null | undefined

  constructor(private readonly io: ProjectStorageIo) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    // A failed write must not poison subsequent edits or reads.
    this.queue = result.catch(() => undefined)
    return result
  }

  load(): Promise<ProjectsStore> {
    return this.enqueue(async () => {
      const { value, version } = await this.io.readJson(PROJECTS_STORE_FILE)
      this.seen = version
      return parseStore(value)
    })
  }

  /** What another copy saved, or null when nothing has changed since this one last looked. */
  loadIfChanged(): Promise<ProjectsStore | null> {
    return this.enqueue(async () => {
      const { value, version } = await this.io.readJson(PROJECTS_STORE_FILE)
      if (version === this.seen) return null
      this.seen = version
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
      for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
        if (attempt > 1) await new Promise(resolve => setTimeout(resolve, Math.random() * 15 * attempt))
        const { value, version } = await this.io.readJson(PROJECTS_STORE_FILE)
        const next = mutate(parseStore(value))
        const result = await this.io.writeJson(
          PROJECTS_STORE_FILE,
          next,
          version,
        )
        if (result.ok) {
          // the version it will read back: what it just wrote is nothing new to it
          this.seen = result.version ?? undefined
          return next
        }
        if (!result.conflict)
          throw new Error('the project store could not be saved')
      }
      throw new Error('another window kept changing the project store — try again')
    })
  }
}
