import { useOutletContext } from 'react-router-dom'
import { can, type SessionUser } from '@/auth/session'

// The signed-in lab user, supplied by LabLayout. Used to hide actions; the server enforces the same rules.
export function useLabUser() {
  const { user } = useOutletContext<{ user: SessionUser }>()
  return { user, canVerify: can(user, 'verify') }
}
