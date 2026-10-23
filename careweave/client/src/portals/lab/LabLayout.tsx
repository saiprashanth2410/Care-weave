import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'

const NAV = [
  { to: '/lab/overview', label: 'Overview' },
  { to: '/lab/orders', label: 'Test Orders' },
  { to: '/lab/samples', label: 'Sample Tracking' },
  { to: '/lab/results', label: 'Result Entry' },
  { to: '/lab/verification', label: 'Verification Queue' },
]

export default function LabLayout() {
  const [open, setOpen] = useState(false)

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
        <div className="sticky top-0">
          <Brand />
          {nav}
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
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <div className="hidden items-center justify-between border-b border-rule bg-surface px-8 py-3 lg:flex">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-ink">Laboratory</p>
          <p className="text-sm text-ink-2">
            <span className="font-semibold text-ink">Laboratory assistant</span> · signed in
          </p>
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
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
      <p className="text-base font-bold leading-none tracking-tight">CareWeave</p>
      <p className="mt-1.5 text-[11px] uppercase tracking-widest text-surface/70">Laboratory</p>
    </div>
  )
}
