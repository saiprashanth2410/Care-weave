import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { ClipboardList, FlaskConical, LayoutDashboard, Menu, ShieldCheck, TestTube2, X } from 'lucide-react'

const NAV = [
  { to: '/lab/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/lab/orders', label: 'Test Orders', icon: ClipboardList },
  { to: '/lab/samples', label: 'Sample Tracking', icon: TestTube2 },
  { to: '/lab/results', label: 'Result Entry', icon: FlaskConical },
  { to: '/lab/verification', label: 'Verification Queue', icon: ShieldCheck },
]

export default function LabLayout() {
  const [open, setOpen] = useState(false)

  const nav = (
    <nav className="flex flex-col gap-1 p-3" aria-label="Laboratory">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`
          }
        >
          <Icon size={17} />
          {label}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden bg-navy-900 text-white lg:block">
        <div className="sticky top-0">
          <Brand />
          {nav}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-navy-900 px-4 py-3 text-white lg:hidden">
        <Brand compact />
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-md p-3 hover:bg-white/10">
          <Menu size={20} />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 bg-navy-900 text-white shadow-2xl">
            <div className="flex items-center justify-between pr-3">
              <Brand compact />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-md p-3 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}

      <div className="min-w-0">
        <div className="hidden items-center justify-between border-b border-slate-200 bg-white px-8 py-3 lg:flex">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">Laboratory portal</p>
          <div className="flex items-center gap-3 text-right">
            <div>
              <p className="text-sm font-semibold leading-tight text-slate-900">Laboratory assistant</p>
              <p className="text-[11px] text-slate-500">Signed in</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-600">L</div>
          </div>
        </div>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${compact ? 'px-4 py-3' : 'px-5 py-5'}`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600">
        <FlaskConical size={18} />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold">CareWeave</p>
        <p className="text-[10px] uppercase tracking-widest text-slate-400">Laboratory</p>
      </div>
    </div>
  )
}
