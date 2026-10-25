import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, CalendarCheck, Eye, EyeOff, FlaskConical, Scan, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react'
import { firebaseConfigured, firebaseResetPassword, firebaseSignIn } from './firebase'
import { authConfig, HOME, signIn, signInWithFirebaseToken } from './session'

const BARS = [42, 30, 55, 38, 68, 50, 82, 62, 90, 74, 96, 88]

const INPUT =
  'w-full h-11 px-3.5 rounded-lg border border-slate-700 bg-[#151c2c] text-sm text-slate-100 placeholder:text-slate-500 outline-none transition duration-150 focus:border-slate-500 focus:ring-1 focus:ring-slate-600'

const STYLES = `
@keyframes cwFloat { 0%,100% { transform: translateY(0) rotate(var(--rot,0deg)); } 50% { transform: translateY(-10px) rotate(var(--rot,0deg)); } }
@keyframes cwPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.5; transform:scale(.85); } }
@keyframes cwBlob { 0%,100% { transform:translate(0,0) scale(1); } 33% { transform:translate(40px,-50px) scale(1.08); } 66% { transform:translate(-30px,30px) scale(.94); } }
@keyframes cwShift { 0%,100% { background-position:0% 50%; } 50% { background-position:100% 50%; } }
.cw-float { animation: cwFloat 5s ease-in-out infinite; }
.cw-float-slow { animation: cwFloat 7s ease-in-out infinite; }
.cw-pulse { animation: cwPulse 2s ease-in-out infinite; }
.cw-blob { animation: cwBlob 16s ease-in-out infinite; }
.cw-grad { background-size:200% 200%; animation: cwShift 8s ease infinite; }
.cw-glass { background: rgba(21,28,44,.72); backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); }
.cw-tilt { transition: transform .4s cubic-bezier(.2,.8,.2,1); }
.cw-tilt:hover { transform: rotate(0deg) scale(1.03) translateY(-6px) !important; }
@media (prefers-reduced-motion: reduce) { .cw-float,.cw-float-slow,.cw-pulse,.cw-blob,.cw-grad { animation:none; } }
`

function FloatingCard({ className = '', style, children }: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div className={`cw-glass rounded-[22px] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.45)] cw-tilt ${className}`} style={style}>
      {children}
    </div>
  )
}

function LoginInner() {
  const nav = useNavigate()
  const [cfg, setCfg] = useState<{ firebase: boolean; localLogin: boolean } | null>(null)
  const [useLocal, setUseLocal] = useState(false)
  const mode: 'loading' | 'firebase' | 'local' = !cfg ? 'loading' : cfg.firebase && !useLocal ? 'firebase' : 'local'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [caps, setCaps] = useState(false)
  const [remember, setRemember] = useState(true)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cw_email')
      if (saved) setEmail(saved)
    } catch { /* storage unavailable */ }
    authConfig()
      .then(setCfg)
      .catch(() => {
        setCfg({ firebase: false, localLogin: true })
        setError('Could not reach the server. Check that it is running.')
      })
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    try {
      let user
      if (mode === 'firebase') {
        try {
          const idToken = await firebaseSignIn(email.trim(), password)
          user = await signInWithFirebaseToken(idToken)
        } catch (fbErr: any) {
          // If Firebase authentication fails (e.g. user not yet added in Firebase console), attempt server auth fallback
          try {
            user = await signIn(email.trim(), password)
          } catch {
            throw fbErr
          }
        }
      } else {
        user = await signIn(email.trim(), password)
      }
      try {
        if (remember) localStorage.setItem('cw_email', email.trim())
        else localStorage.removeItem('cw_email')
      } catch { /* storage unavailable */ }
      nav(HOME[user.role] ?? '/login', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function forgot() {
    setError('')
    setNotice('')
    if (!email.trim()) {
      setError('Enter your email above first.')
      return
    }
    if (mode !== 'firebase') {
      setNotice('Ask an administrator to reset your password.')
      return
    }
    try {
      await firebaseResetPassword(email.trim())
      setNotice('If that email belongs to a staff account, a reset link is on its way.')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const missingConfig = mode === 'firebase' && !firebaseConfigured

  return (
    <div className="min-h-screen bg-[#0b1220] font-sans text-slate-100 antialiased">
      <style>{STYLES}</style>
      <div className="grid min-h-screen lg:grid-cols-[42%_58%]">
        <section className="relative flex min-h-screen items-center justify-center border-r border-slate-800 bg-[#151c2c] px-6 py-10 sm:px-10 lg:px-14 xl:px-20">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(#0f766e 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="relative z-10 w-full max-w-[390px]">
            <div className="w-full rounded-2xl border border-slate-700/60 bg-[#151c2c] p-7 shadow-sm sm:p-9">
              <div className="mb-6 flex flex-col items-center">
                <img src="/careweave-mark-transparent.png" alt="" className="mb-3 h-16 w-16" />
                <h1 className="text-xl font-bold tracking-tight text-slate-100">CareWeave</h1>
                <p className="mt-1 text-xs text-slate-400">Staff sign in</p>
              </div>

              <div aria-live="polite">
                {missingConfig && (
                  <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-lg border border-rose-500/40 bg-rose-500/15 p-3 text-xs text-rose-300">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-500" />
                    <span className="leading-relaxed">Firebase is not set up in this app yet. Add the VITE_FIREBASE_* values to client/.env and restart.</span>
                  </div>
                )}
                {error && (
                  <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-lg border border-rose-500/40 bg-rose-500/15 p-3 text-xs text-rose-300">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-500" />
                    <span className="leading-relaxed">{error}</span>
                  </div>
                )}
                {notice && <div role="status" className="mb-4 rounded-lg border border-teal-500/40 bg-teal-500/15 p-3 text-xs text-teal-200">{notice}</div>}
              </div>

              <form onSubmit={submit} className="space-y-3.5" noValidate>
                <input id="email" aria-label="Email" type="email" autoComplete="username" autoFocus placeholder="Username or E-mail" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} className={INPUT} />
                <div className="relative">
                  <input
                    id="password"
                    aria-label="Password"
                    type={show ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError('') }}
                    onKeyUp={(e) => setCaps(e.getModifierState('CapsLock'))}
                    onBlur={() => setCaps(false)}
                    className={`${INPUT} pr-10`}
                  />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-300">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {caps && <p className="text-xs text-rose-400">Caps Lock is on.</p>}

                <div className="flex items-center gap-2 pt-0.5">
                  <input id="remember" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 cursor-pointer rounded border-slate-600 accent-slate-700" />
                  <label htmlFor="remember" className="cursor-pointer select-none text-xs text-slate-400">Keep my email on this device</label>
                </div>

                <button type="submit" disabled={busy || mode === 'loading' || missingConfig} className="flex h-11 w-full items-center justify-center rounded-lg bg-[#545e75] text-sm font-medium text-white shadow-sm transition hover:bg-[#434b5e] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60">
                  {busy ? (
                    <span className="flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Signing in...</span>
                  ) : 'Sign In'}
                </button>

                <p className="pt-1 text-center text-[12px] leading-normal text-slate-400">
                  By continuing, you agree to{' '}
                  <Link to="/terms" className="text-[#0284c7] hover:underline">Terms</Link> &{' '}
                  <Link to="/privacy" className="text-[#0284c7] hover:underline">Privacy Policy</Link>.
                </p>

                <div className="flex items-center justify-between pt-2 text-sm text-slate-300">
                  <button type="button" onClick={forgot} className="cursor-pointer hover:underline">Forgot Password?</button>
                  {cfg?.firebase && cfg.localLogin && (
                    <button type="button" onClick={() => { setUseLocal((v) => !v); setError(''); setNotice('') }} className="cursor-pointer text-xs text-slate-400 hover:underline">
                      {useLocal ? 'Use Firebase' : 'Dev sign-in'}
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="mt-8 flex items-center justify-center gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5"><ShieldCheck size={12} className="text-teal-600" />Firebase Auth</span>
              <span>·</span>
              <span>Accounts issued by an administrator</span>
            </div>
          </div>
        </section>

        <section className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-[#0b1220] lg:flex">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <svg className="cw-blob absolute left-[-15%] top-[-12%] h-[640px] w-[640px] opacity-30" viewBox="0 0 200 200"><path fill="#14b8a6" transform="translate(100 100)" d="M40,-58C54,-48,68,-38,73,-24C78,-10,74,8,66,23C58,38,45,50,30,58C15,66,-3,70,-19,65C-35,60,-48,47,-57,32C-66,17,-70,0,-66,-15C-62,-30,-51,-43,-38,-53C-25,-63,-12,-71,3,-75C18,-79,27,-68,40,-58Z" /></svg>
            <svg className="cw-blob absolute bottom-[-15%] right-[-10%] h-[580px] w-[580px] opacity-20" style={{ animationDelay: '-5s' }} viewBox="0 0 200 200"><path fill="#f59e0b" transform="translate(100 100)" d="M43,-66C58,-57,72,-47,77,-33C82,-19,79,-2,72,13C65,28,54,41,40,51C26,61,9,68,-8,68C-25,68,-42,61,-55,50C-68,39,-77,24,-78,8C-79,-8,-73,-25,-62,-37C-51,-49,-35,-56,-19,-63C-3,-70,13,-75,43,-66Z" /></svg>
            <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(#0f766e 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
          </div>

          <div className="relative z-10 flex min-h-screen flex-col justify-between px-16 py-10 xl:px-20">
            <div className="flex items-center gap-3">
              <img src="/careweave-mark-transparent.png" alt="" className="h-14 w-14" />
              <div>
                <p className="text-xl font-bold tracking-tight text-slate-100">CareWeave</p>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-teal-300/70">Unified records</p>
              </div>
            </div>

            <div className="my-6 flex flex-1 items-center">
              <div className="w-full max-w-[720px]">
                <div aria-hidden className="relative h-[440px] lg:h-[470px]">
                  <div className="cw-tilt absolute left-[18%] top-[7%] h-[75%] w-[55%] rotate-[-4deg] overflow-hidden rounded-[36px] bg-gradient-to-br from-[#0f766e] via-[#0d9488] to-[#14b8a6] shadow-[0_35px_70px_rgba(13,148,136,0.28)]">
                    <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/15" />
                    <div className="absolute -left-10 bottom-10 h-40 w-40 rounded-full border border-white/10" />
                    <div className="absolute inset-x-7 top-7">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#151c2c]/15 text-white"><Users size={14} /></div>
                          <span className="text-[10px] font-medium text-white/80">Patient chart</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-white/80"><span className="cw-pulse h-1.5 w-1.5 rounded-full bg-amber-300" />Live</div>
                      </div>
                      <div className="mt-8">
                        <p className="text-[10px] text-white/60">One record</p>
                        <p className="mt-1 text-3xl font-bold tracking-tight text-white">Every desk</p>
                        <div className="mt-1 text-[10px] text-amber-100">Front desk, lab and doctor in sync</div>
                      </div>
                    </div>
                    <div className="absolute bottom-8 left-7 right-7 flex h-32 items-end gap-1.5">
                      {BARS.map((h, i) => <div key={i} className="flex-1 rounded-t-md bg-[#151c2c]/30" style={{ height: `${h}%` }} />)}
                    </div>
                  </div>

                  <FloatingCard className="cw-float absolute left-[2%] top-[50%] w-[250px] p-4" style={{ '--rot': '4deg' } as React.CSSProperties}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/15"><FlaskConical size={20} className="text-teal-600" /></div>
                      <div>
                        <p className="text-[10px] text-slate-400">Laboratory</p>
                        <p className="text-sm font-bold text-slate-100">Result verified</p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-teal-500/150" /><span className="text-[10px] text-slate-400">Released to doctor</span></div>
                  </FloatingCard>

                  <FloatingCard className="cw-float-slow absolute right-[3%] top-[12%] px-4 py-3" style={{ '--rot': '3deg' } as React.CSSProperties}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15"><CalendarCheck size={18} className="text-amber-600" /></div>
                      <div>
                        <p className="text-[10px] text-slate-400">Front desk</p>
                        <p className="text-xs font-bold text-slate-100">Patient registered</p>
                      </div>
                    </div>
                  </FloatingCard>

                  <FloatingCard className="cw-float absolute bottom-[12%] right-[7%] px-4 py-3" style={{ '--rot': '2deg' } as React.CSSProperties}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15"><Sparkles size={17} className="text-rose-500" /></div>
                      <div>
                        <p className="text-[10px] text-slate-400">Reconciliation</p>
                        <p className="text-xs font-bold text-slate-100">Review <span className="font-semibold text-rose-500">needed</span></p>
                      </div>
                    </div>
                  </FloatingCard>

                  <FloatingCard className="cw-float-slow absolute bottom-[4%] left-[26%] flex items-center gap-2 rounded-full px-3 py-1.5" style={{ '--rot': '-3deg' } as React.CSSProperties}>
                    <Scan size={13} className="text-teal-600" /><span className="text-[10px] font-medium text-slate-300">Report scan ready</span>
                  </FloatingCard>

                  <FloatingCard className="cw-float absolute right-[18%] top-[4%] flex items-center gap-2 rounded-full px-3 py-1.5" style={{ '--rot': '6deg' } as React.CSSProperties}>
                    <Zap size={13} className="text-amber-500" /><span className="text-[10px] font-medium text-slate-300">Every action audited</span>
                  </FloatingCard>
                </div>

                <div className="mt-[-15px] max-w-[650px]">
                  <h2 className="text-[58px] font-bold leading-[1] tracking-[-0.045em] text-slate-100 xl:text-[66px]">
                    One patient chart.
                    <br />
                    <span className="cw-grad bg-gradient-to-r from-teal-600 via-teal-500 to-amber-500 bg-clip-text text-transparent">Every desk in sync.</span>
                  </h2>
                  <p className="mt-6 max-w-[520px] text-base leading-7 text-slate-400">
                    CareWeave brings the front desk, laboratory and doctors onto one record, each seeing only what their job needs.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default LoginInner
