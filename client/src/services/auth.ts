import { apiFetch, setToken } from './api'
import type { User } from '../types'

type AuthResponse = {
  user: User
  token: string
}

export async function login(email: string, password: string) {
  const data = await apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setToken(data.token)
  sessionStorage.setItem('codejudge:user', JSON.stringify(data.user))
  return data.user
}

export async function register(username: string, email: string, password: string) {
  const data = await apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  })
  setToken(data.token)
  sessionStorage.setItem('codejudge:user', JSON.stringify(data.user))
  return data.user
}

export async function loadMe() {
  const data = await apiFetch<{ user: User }>('/api/auth/me')
  sessionStorage.setItem('codejudge:user', JSON.stringify(data.user))
  return data.user
}

export function loadCachedUser() {
  const raw = sessionStorage.getItem('codejudge:user')
  return raw ? (JSON.parse(raw) as User) : null
}

export function logout() {
  setToken(null)
  sessionStorage.removeItem('codejudge:user')
  sessionStorage.removeItem('codejudge:problems')
}
