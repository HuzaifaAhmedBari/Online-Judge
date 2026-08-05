import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../App'
import AuthDialog from './AuthDialog'

export default function TopNav() {
  const { user, logoutUser } = useAuth()
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null)
  const canAuthor = user?.role === 'author' || user?.role === 'admin'

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `font-body-md text-body-md ${isActive ? 'text-primary font-bold border-b-2 border-primary pb-1' : 'text-on-surface-variant font-medium hover:text-primary'} transition-colors duration-200`

  return (
    <>
      <header className="flex justify-between items-center w-full px-gutter h-14 sticky top-0 z-50 bg-background border-b border-outline-variant">
        <div className="flex items-center gap-8">
          <NavLink to="/" className="font-headline-md text-headline-md font-bold text-primary">CodeJudge</NavLink>
          <nav className="hidden md:flex gap-6 items-center">
            <NavLink className={linkClass} to="/problems" end>Problems</NavLink>
            <NavLink className={linkClass} to="/contests">Contests</NavLink>
            {canAuthor ? <NavLink className={linkClass} to="/problems/new">Create Problem</NavLink> : null}
            {user?.role === 'admin' ? <span className="font-body-md text-body-md text-on-surface-variant opacity-60">Admin Panel</span> : null}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <span className="hidden sm:block font-data-label text-data-label text-on-surface-variant">{user.username} / {user.role}</span>
              <button onClick={logoutUser} className="text-on-surface-variant font-data-label text-data-label hover:text-primary">Logout</button>
            </>
          ) : (
            <>
              <button onClick={() => setAuthMode('login')} className="text-on-surface-variant font-data-label text-data-label hover:text-primary">Login</button>
              <button onClick={() => setAuthMode('register')} className="bg-primary-container text-on-primary-container px-4 py-1.5 rounded font-data-label text-data-label font-bold">Register</button>
            </>
          )}
        </div>
      </header>
      {authMode ? <AuthDialog mode={authMode} onClose={() => setAuthMode(null)} /> : null}
    </>
  )
}
