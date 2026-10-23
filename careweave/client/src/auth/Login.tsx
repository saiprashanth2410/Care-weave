import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { HOME, signIn, type Role } from './session'

const ACCOUNTS: { role: Role; label: string; email: string; desc: string; open: boolean }[] = [
  {
    role: 'receptionist',
    label: 'Front Desk / Reception',
    email: 'reception@careweave.test',
    desc: 'Patient check-in, registration & queue management',
    open: true,
  },
  {
    role: 'lab',
    label: 'Laboratory Technologist',
    email: 'lab@careweave.test',
    desc: 'Specimens, results entry & analyzer workbench',
    open: true,
  },
  {
    role: 'lab',
    label: 'Consultant Pathologist (Dr. Kala K)',
    email: 'pathologist@careweave.test',
    desc: 'Verification, digital signing & release of reports',
    open: true,
  },
  {
    role: 'doctor',
    label: 'Attending Clinician (Dr. Anirban Laha)',
    email: 'doctor@careweave.test',
    desc: 'OPD consultations & prescription review',
    open: false,
  },
]

export default function Login() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleDirectLogin(accountEmail: string) {
    setEmail(accountEmail)
    setPassword('demo123')
    setError('')
    setBusy(true)
    try {
      const user = await signIn(accountEmail, 'demo123')
      if (!user.role || !(user.role in HOME)) throw new Error('This account has no portal.')
      nav(HOME[user.role], { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const user = await signIn(email.trim(), password)
      if (!user.role || !(user.role in HOME)) throw new Error('This account has no portal.')
      if (user.role === 'doctor') throw new Error('The doctor portal is scheduled for the next release.')
      nav(HOME[user.role], { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Hospital Identity Left Hero */}
      <aside className="bg-deep px-6 py-8 text-surface sm:px-12 lg:flex lg:flex-col lg:justify-between lg:py-12 border-r border-rule">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-accent bg-accent/20 text-accent font-bold">
              CW
            </div>
            <div>
              <p className="text-base font-bold leading-none tracking-tight">CareWeave Medical Centre</p>
              <p className="mt-1 text-[11px] font-mono uppercase tracking-widest text-surface/70">
                Dr. Kamakshi Memorial Services · NABL MC-2128
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 max-w-lg lg:mt-0 space-y-4">
          <div className="inline-flex items-center gap-2 border border-surface/20 bg-surface/10 px-3 py-1 rounded-sm text-xs font-mono text-surface">
            <span>NABH H-2023-1248 Accredited Hospital</span>
          </div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl text-surface">
            Single Centralized Record Across Front Desk & Diagnostic Lab.
          </h1>
          <p className="text-sm leading-relaxed text-surface/80">
            Patients registered at the Reception desk are instantly accessible in Laboratory test orders, sample tracking, analyzer workbenches, and official pathologist diagnostic reporting.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2 text-xs font-mono text-surface/70">
            <div className="border border-surface/20 p-2.5 bg-surface/5">
              <p className="font-bold text-surface">Front Desk Desk</p>
              <p className="text-[11px] mt-0.5">Walk-in triage, queue & central registration</p>
            </div>
            <div className="border border-surface/20 p-2.5 bg-surface/5">
              <p className="font-bold text-surface">Diagnostic Lab</p>
              <p className="text-[11px] mt-0.5">26-test panels, AI scanner & verification</p>
            </div>
          </div>
        </div>

        <div className="mt-10 text-xs text-surface/60 lg:mt-0 flex items-center justify-between">
          <span>Demonstration build. NABL / NABH standard.</span>
          <span className="font-mono">v2.4.0</span>
        </div>
      </aside>

      {/* Sign In Right Panel */}
      <main className="flex items-center px-6 py-10 sm:px-12 bg-surface">
        <div className="mx-auto w-full max-w-md space-y-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-accent-ink">Hospital Authentication</span>
            <h2 className="text-2xl font-bold tracking-tight text-ink mt-0.5">Staff Portal Sign In</h2>
            <p className="text-xs text-ink-2 mt-1">
              Select your department demo role below for 1-click access or enter staff credentials.
            </p>
          </div>

          {/* Quick 1-Click Role Login Cards */}
          <div className="space-y-2 border-t border-b border-rule py-4">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-3">
              1-Click Instant Hospital Staff Access:
            </p>
            <div className="grid gap-2">
              {ACCOUNTS.filter((a) => a.open).map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => handleDirectLogin(a.email)}
                  disabled={busy}
                  className="flex items-center justify-between border border-rule bg-paper p-3 text-left hover:border-accent hover:bg-paper/80 transition"
                >
                  <div>
                    <p className="text-sm font-bold text-ink">{a.label}</p>
                    <p className="text-[11px] text-ink-3">{a.desc}</p>
                  </div>
                  <span className="rounded-sm bg-accent px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-surface">
                    Login →
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Manual Credential Sign In Form */}
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-3">
                Staff Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="reception@careweave.test"
                className="h-11 w-full border border-rule bg-paper px-3 text-sm text-ink font-medium"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-3">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 w-full border border-rule bg-paper px-3 text-sm text-ink"
              />
            </div>

            {error && (
              <p role="alert" className="border border-alert bg-alert/10 px-3 py-2 text-xs font-semibold text-alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="h-11 w-full bg-accent text-xs font-bold uppercase tracking-wider text-surface hover:bg-accent-ink disabled:opacity-60"
            >
              {busy ? 'Authenticating...' : 'Sign In With Credentials'}
            </button>
          </form>

          <p className="flex gap-4 text-xs text-ink-3 border-t border-rule pt-4">
            <Link to="/terms" className="underline underline-offset-2 hover:text-ink">Terms of Service</Link>
            <Link to="/privacy" className="underline underline-offset-2 hover:text-ink">Privacy Policy</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
