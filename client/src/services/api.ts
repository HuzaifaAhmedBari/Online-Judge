const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function getToken() {
  return sessionStorage.getItem('codejudge:token')
}

export function setToken(token: string | null) {
  if (token) sessionStorage.setItem('codejudge:token', token)
  else sessionStorage.removeItem('codejudge:token')
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(options.headers)

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}`)
  }

  return data as T
}
