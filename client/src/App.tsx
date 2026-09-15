import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { loadCachedUser, loadMe, login, logout, register } from './services/auth'
import type { User } from './types'
import LandingPage from './pages/LandingPage'
import ProblemsPage from './pages/ProblemsPage'
import ProblemDetailPage from './pages/ProblemDetailPage'
import ProblemFormPage from './pages/ProblemFormPage'
import ContestsPage from './pages/ContestsPage'

type AuthContextValue = {
  user: User | null
  authLoading: boolean
  setUser: (user: User | null) => void
  loginUser: (email: string, password: string) => Promise<void>
  registerUser: (username: string, email: string, password: string) => Promise<void>
  logoutUser: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthContext')
  return value
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => loadCachedUser())
  const [authLoading, setAuthLoading] = useState(() => Boolean(loadCachedUser()))

  useEffect(() => {
    if (!user) {
      setAuthLoading(false)
      return
    }
    loadMe().then(setUser).catch(() => setUser(null)).finally(() => setAuthLoading(false))
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authLoading,
      setUser,
      loginUser: async (email, password) => setUser(await login(email, password)),
      registerUser: async (username, email, password) => setUser(await register(username, email, password)),
      logoutUser: () => {
        logout()
        setUser(null)
      },
    }),
    [user, authLoading],
  )

  return (
    <AuthContext.Provider value={value}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/problems" element={<ProblemsPage />} />
        <Route path="/problems/new" element={<ProblemFormPage mode="create" />} />
        <Route path="/problems/:id" element={<ProblemDetailPage />} />
        <Route path="/problems/:id/edit" element={<ProblemFormPage mode="edit" />} />
        <Route path="/contests" element={<ContestsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  )
}
