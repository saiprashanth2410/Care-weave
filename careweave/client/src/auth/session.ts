export type Role = 'receptionist' | 'lab' | 'doctor'
export type SessionUser = { id: string; name: string; email: string; role: Role; facility: string; permissions?: string[] }

const TOKEN_KEY = 'cw_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY)
  // Also end the Firebase session when there is one. Loaded on demand so the page works without Firebase.
  void import('./firebase').then((m) => m.firebaseSignOut())
}

export const HOME: Record<Role, string> = {
  receptionist: '/receptionist',
  lab: '/lab/overview',
  doctor: '/doctor',
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Request failed')
  return body as T
}

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const r = await call<{ token: string; user: SessionUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  localStorage.setItem(TOKEN_KEY, r.token)
  return r.user
}

export const authConfig = () => call<{ firebase: boolean; localLogin: boolean }>('/api/auth/config')

/** Exchange a Firebase ID token for a CareWeave session. The server verifies the token and decides the role. */
export async function signInWithFirebaseToken(idToken: string): Promise<SessionUser> {
  const r = await call<{ token: string; user: SessionUser }>('/api/auth/firebase-login', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  })
  localStorage.setItem(TOKEN_KEY, r.token)
  return r.user
}

export const can = (user: SessionUser, permission: string) => !!user.permissions?.includes(permission)

export const currentUser = () => call<SessionUser>('/api/me')
