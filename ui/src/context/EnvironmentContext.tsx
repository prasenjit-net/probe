import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { listEnvironments } from '../api/client'
import type { Environment } from '../types'

interface EnvironmentContextValue {
  environments: Environment[]
  activeEnvId: string | null
  activeEnv: Environment | null
  setActiveEnvId: (id: string | null) => void
  reload: () => Promise<void>
}

const EnvironmentContext = createContext<EnvironmentContextValue>({
  environments: [],
  activeEnvId: null,
  activeEnv: null,
  setActiveEnvId: () => {},
  reload: async () => {},
})

const STORAGE_KEY = 'probe_active_env_id'

const readStorage = (): string | null => {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}
const writeStorage = (id: string | null): void => {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* private browsing or storage full — ignore */ }
}

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [activeEnvId, setActiveEnvIdState] = useState<string | null>(
    () => readStorage()
  )

  const reload = useCallback(async () => {
    try {
      const envs = await listEnvironments()
      setEnvironments(envs)
      // Clear stale selection if the env was deleted
      setActiveEnvIdState(prev => {
        if (prev && !envs.find(e => e.id === prev)) {
          writeStorage(null)
          return null
        }
        return prev
      })
    } catch {
      // silently ignore — user may not be logged in yet
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
  }, [reload])

  const setActiveEnvId = (id: string | null) => {
    setActiveEnvIdState(id)
    writeStorage(id)
  }

  const activeEnv = environments.find(e => e.id === activeEnvId) ?? null

  return (
    <EnvironmentContext.Provider value={{ environments, activeEnvId, activeEnv, setActiveEnvId, reload }}>
      {children}
    </EnvironmentContext.Provider>
  )
}

export const useEnvironment = () => useContext(EnvironmentContext)
