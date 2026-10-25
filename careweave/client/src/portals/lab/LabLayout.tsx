import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import SampleScenario from '@/components/SampleScenario'
import { clearSession, type SessionUser } from '@/auth/session'

const NAV = [
  { to: '/lab/overview', label: 'Overview' },
  { to: '/lab/orders', label: 'Test Orders' },
  { to: '/lab/samples', label: 'Sample Tracking' },
  { to: '/lab/results', label: 'Result Entry' },
  { to: '/lab/verification', label: 'Verification Queue' },
  { to: '/analytics', label: 'Exasol Analytics' },
]

export default function LabLayout({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const [notice, setNotice] = useState<{ message: string; write: boolean } | null>(null)
  useEffect(() => {
    const onError = (e: Event) => setNotice((e as CustomEvent<{ message: string; write: boolean }>).detail)
    window.addEventListener('cw:error', onError)
    return () => window.removeEventListener('cw:error', onError)
  }, [])
  const signOut = () => {
    clearSession()
    navigate('/login', { replace: true })
  }

  const nav = (
    <nav className="flex flex-col gap-0.5 px-3 pb-4" aria-label="Laboratory">
      {NAV.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex min-h-11 items-center rounded-sm px-3 text-sm font-medium ${
              isActive ? 'bg-accent text-surface' : 'text-surface/80 hover:bg-surface/10 hover:text-surface'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden bg-deep text-surface lg:block">
        <div className="sticky top-0 flex h-screen flex-col">
          <Brand />
          {nav}
          <div className="mt-auto border-t border-surface/20 px-5 py-4">
            <p className="text-sm font-semibold leading-tight">{user.name}</p>
            <p className="mt-0.5 text-xs text-surface/70">{user.facility ?? 'Laboratory'}</p>
            <button onClick={signOut} className="mt-3 min-h-11 text-sm font-medium text-surface/80 underline underline-offset-2 hover:text-surface">Sign out</button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between bg-deep pr-2 text-surface lg:hidden">
        <Brand />
        <button onClick={() => setOpen(true)} className="min-h-11 rounded-sm px-4 text-sm font-semibold hover:bg-surface/10">
          Menu
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-deep/70" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 bg-deep text-surface">
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <button onClick={() => setOpen(false)} className="min-h-11 rounded-sm px-4 text-sm font-semibold hover:bg-surface/10">
                Close
              </button>
            </div>
            {nav}
            <button onClick={signOut} className="mx-3 min-h-11 w-[calc(100%-1.5rem)] rounded-sm px-3 text-left text-sm font-medium text-surface/80 hover:bg-surface/10">Sign out</button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <div className="hidden items-center justify-between border-b border-rule bg-surface px-8 py-3 lg:flex">
          <p className="flex items-center gap-4 text-xs font-semibold uppercase tracking-wider text-accent-ink">Laboratory <SampleScenario className="[&_button]:min-h-8 [&_button]:border [&_button]:border-rule [&_button]:px-2 [&_button]:text-xs [&_button]:normal-case [&_button]:tracking-normal" /></p>
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {notice && (
            <div role="alert" className="mb-6 flex items-start justify-between gap-4 border border-alert bg-surface px-4 py-3 text-sm text-alert">
              <p><strong className="font-semibold">{notice.write ? 'Not saved.' : 'Could not load.'}</strong> {notice.message}</p>
              <button onClick={() => setNotice(null)} className="min-h-6 text-xs font-semibold underline underline-offset-2">Dismiss</button>
            </div>
          )}
          <Outlet context={{ user }} />
        </main>
        <footer className="border-t border-rule px-4 py-4 text-xs text-ink-3 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <span>CareWeave demonstration build. Synthetic data only.</span>
            <span className="flex gap-4">
              <Link to="/terms" className="underline underline-offset-2 hover:text-ink">Terms of Service</Link>
              <Link to="/privacy" className="underline underline-offset-2 hover:text-ink">Privacy Policy</Link>
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <div className="px-5 py-5">
      <div className="flex items-center gap-3">
        <img src="/careweave-mark-transparent.png" alt="" className="h-10 w-10" />
        <p className="text-base font-bold leading-none tracking-tight">CareWeave</p>
      </div>
    </div>
  )
}
