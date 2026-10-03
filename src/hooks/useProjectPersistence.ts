import { useCallback, useRef, useState } from 'react'
import { emptyStore } from '../lib/projectModel'
import type { ProjectStore } from '../lib/projectStore'
import type { ProjectsStore } from '../types'

/** Disk is authoritative. Publish only acknowledged writes, in storage queue order. */
export function useProjectPersistence(
  storage: ProjectStore,
  standalone: boolean,
) {
  const [store, publish] = useState(emptyStore)
  const storeRef = useRef(store)
  const [writeError, setWriteError] = useState<string | null>(null)
  const setStore = useCallback((value: ProjectsStore) => {
    storeRef.current = value
    publish(value)
  }, [])
  const refresh = useCallback(async () => {
    if (standalone) return storeRef.current
    try {
      const value = await storage.load()
      setStore(value)
      return value
    } catch (error) {
      setWriteError(
        `Projects could not be refreshed — ${String(
          error instanceof Error ? error.message : error,
        )}`,
      )
      throw error
    }
  }, [storage, standalone, setStore])
  const mutate = useCallback(
    async (change: (value: ProjectsStore) => ProjectsStore) => {
      try {
        const value = standalone
          ? change(storeRef.current)
          : await storage.update(change)
        setStore(value)
        setWriteError(null)
        return value
      } catch (error) {
        setWriteError(
          `That change was not saved — ${String(
            error instanceof Error ? error.message : error,
          )}`,
        )
        // Agents and UI follow-up actions must not receive a false success.
        throw error
      }
    },
    [storage, standalone, setStore],
  )
  return {
    store,
    storeRef,
    setStore,
    refresh,
    mutate,
    writeError,
    setWriteError,
  }
}
