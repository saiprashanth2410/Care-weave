import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { MIN_PASSWORD, passwordProblem } from './passwordRules'

const INPUT =
  'w-full h-11 px-3.5 pr-10 rounded-lg border border-slate-700 bg-[#0f1626] text-sm text-slate-100 placeholder:text-slate-500 outline-none transition duration-150 focus:border-slate-500 focus:ring-1 focus:ring-slate-600'

function PasswordField({ id, label, value, onChange, autoFocus }: { id: string; label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-400">{label}</label>
      <div className="relative">
        {/* The toggle swaps the input type itself, so it works the same in every browser, including with a suggested password filled in. */}
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-400"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}

/**
 * Where a reset link lands. The link holds a one-time code from Firebase; this page shows whose password it is for, lets the
 * person choose a new one (with a working show/hide button and a confirmation), and saves it.
 */
export default function ResetPassword() {
  const [params] = useSearchParams()
  const code = params.get('oobCode') || ''
  const [state, setState] = useState<'checking' | 'ready' | 'done' | 'invalid'>(code ? 'checking' : 'invalid')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(code ? '' : 'This link is not complete. Ask an administrator for a new one.')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!code) return
    let live = true
    // The Firebase SDK loads only when someone opens a reset link.
    import('./firebase')
      .then((m) => m.firebaseVerifyResetCode(code))
      .then((who) => { if (live) { setEmail(who); setState('ready') } })
      .catch((e: Error) => { if (live) { setError(e.message); setState('invalid') } })
    return () => { live = false }
  }, [code])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const problem = passwordProblem(password, confirm)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    try {
      const m = await import('./firebase')
      await m.firebaseConfirmReset(code, password)
      setState('done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b1220] px-6 py-10 font-sans text-slate-100 antialiased">
      <div className="w-full max-w-[400px] rounded-2xl border border-slate-700/60 bg-[#151c2c] p-7 shadow-sm sm:p-9">
        <div className="mb-6 flex flex-col items-center">
          <img src="/careweave-mark-transparent.png" alt="" className="mb-3 h-14 w-14" />
          <h1 className="text-xl font-bold tracking-tight">Choose a new password</h1>
          {state === 'ready' && <p className="mt-1 text-xs text-slate-400">for <b className="text-slate-200">{email}</b></p>}
        </div>

        {state === 'checking' && <p role="status" className="text-center text-sm text-slate-400">Checking your link…</p>}

        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-lg border border-rose-500/40 bg-rose-500/15 p-3 text-xs text-rose-300">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-500" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {state === 'ready' && (
          <form onSubmit={submit} className="space-y-3.5" noValidate>
            <PasswordField id="new-password" label="New password" value={password} onChange={(v) => { setPassword(v); setError('') }} autoFocus />
            <PasswordField id="confirm-password" label="Confirm new password" value={confirm} onChange={(v) => { setConfirm(v); setError('') }} />
            <p className="text-[11px] text-slate-500">At least {MIN_PASSWORD} characters.</p>
            <button
              type="submit"
              disabled={busy}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-[#545e75] text-sm font-medium text-white shadow-sm transition hover:bg-[#667087] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save password'}
            </button>
          </form>
        )}

        {state === 'done' && (
          <div role="status" className="space-y-4 text-center">
            <p className="rounded-lg border border-teal-500/40 bg-teal-500/15 p-3 text-sm text-teal-200">Your password has been changed.</p>
            <Link to="/login" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#545e75] text-sm font-medium text-white transition hover:bg-[#667087]">Go to sign in</Link>
          </div>
        )}

        {state === 'invalid' && (
          <Link to="/login" className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-lg border border-slate-600 text-sm font-medium text-slate-200 transition hover:bg-slate-800">Back to sign in</Link>
        )}
      </div>
    </div>
  )
}
