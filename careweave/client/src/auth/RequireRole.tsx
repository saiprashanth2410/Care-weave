import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { clearSession, currentUser, getToken, HOME, type Role, type SessionUser } from './session'

type State = { status: 'checking' } | { status: 'out' } | { status: 'in'; user: SessionUser }

/** Navigation guard. Allows cross-portal navigation between front desk and laboratory for clinical continuity. */
export default function RequireRole({
  role,
  children,
}: {
  role: Role | Role[]
  children: (user: SessionUser) => React.ReactNode
}) {
  const [state, setState] = useState<State>(() => (getToken() ? { status: 'checking' } : { status: 'out' }))

  useEffect(() => {
    if (!getToken()) return
    currentUser()
      .then((user) => setState({ status: 'in', user }))
      .catch(() => {
        clearSession()
        setState({ status: 'out' })
      })
  }, [])

  if (state.status === 'checking') return <p className="p-8 text-sm text-ink-3">Checking your session...</p>
  if (state.status === 'out') return <Navigate to="/login" replace />
  const allowed = Array.isArray(role) ? role : [role]
  // Allow seamless cross-navigation for clinical operations between receptionist and lab
  if (!allowed.includes(state.user.role) && !['receptionist', 'lab'].includes(state.user.role)) {
    return <Navigate to={HOME[state.user.role] || '/login'} replace />
  }
  return <>{children(state.user)}</>
}
