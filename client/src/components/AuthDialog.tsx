import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../App'

type AuthDialogProps = {
  mode: 'login' | 'register'
  onClose: () => void
}

export default function AuthDialog({ mode, onClose }: AuthDialogProps) {
  const { loginUser, registerUser } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      if (mode === 'login') {
        await loginUser(String(form.get('email')), String(form.get('password')))
      } else {
        await registerUser(String(form.get('username')), String(form.get('email')), String(form.get('password')))
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center px-gutter">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-surface border border-outline-variant rounded p-5 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-headline-md text-headline-md text-on-surface">{mode === 'login' ? 'Login' : 'Register'}</h2>
          <button type="button" onClick={onClose} className="text-outline hover:text-primary">Close</button>
        </div>
        {mode === 'register' ? (
          <input name="username" placeholder="Username" required className="w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 text-on-surface focus:border-primary outline-none" />
        ) : null}
        <input name="email" type="email" placeholder="Email" required className="w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 text-on-surface focus:border-primary outline-none" />
        <input name="password" type="password" placeholder="Password" required className="w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 text-on-surface focus:border-primary outline-none" />
        {error ? <p className="font-data-label text-data-label text-error">{error}</p> : null}
        <button disabled={busy} className="w-full bg-primary text-on-primary px-4 py-2 rounded font-bold disabled:opacity-50">
          {busy ? 'Working...' : mode === 'login' ? 'Login' : 'Create Account'}
        </button>
      </form>
    </div>
  )
}
