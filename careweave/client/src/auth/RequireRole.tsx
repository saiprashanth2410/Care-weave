import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { clearSession, currentUser, HOME, type Role, type SessionUser } from './session'

type State = { status: 'checking' } | { status: 'out' } | { status: 'in'; user: SessionUser }

/** Navigation guard: only the named role(s) get in; everyone else goes to their own portal. */
export default function RequireRole({
  role,
  children,
}: {
  role: Role | Role[]
  children: (user: SessionUser) => React.ReactNode
}) {
  const [state, setState] = useState<State>({ status: 'checking' })

  useEffect(() => {
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
  // Each role has its own portal and the server refuses the others' data, so a wrong portal would only show empty screens with a
  // "not permitted" banner. Send people to their own.
  if (!allowed.includes(state.user.role)) return <Navigate to={HOME[state.user.role] || '/login'} replace />
  return <>{children(state.user)}</>
}
