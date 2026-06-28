import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { apiGet, type User } from "./api"

interface AuthState {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthState>({ user: null, loading: true, refresh: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    try {
      const { user } = await apiGet<{ user: User | null }>("/api/auth/me")
      setUser(user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  return <Ctx.Provider value={{ user, loading, refresh }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
