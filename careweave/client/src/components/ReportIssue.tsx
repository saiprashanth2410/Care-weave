import { useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * "Report an issue" for any signed-in person. The message goes to the administrator's Inbox with their name, role and the page
 * they were on attached, so they do not have to explain who they are or where it happened.
 */
export default function ReportIssue({ className = '' }: { className?: string }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const close = () => { setOpen(false); setSent(false); setError(''); setSubject(''); setMessage('') }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim().length < 5) return setError('Describe the problem in a few words.')
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/support/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, page: pathname }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not send. Try again in a moment.')
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || 'rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50'}>
        Report an issue
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={close}>
          <div role="dialog" aria-modal="true" aria-labelledby="report-issue-title" className="w-full max-w-md rounded-lg bg-white p-5 text-slate-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 id="report-issue-title" className="text-lg font-bold">Report an issue</h2>
            <p className="mt-1 text-xs text-slate-500">This goes to the administrator with your name and the page you are on.</p>

            {sent ? (
              <div role="status" className="mt-4 space-y-4">
                <p className="rounded border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900">Sent. The administrator will follow up.</p>
                <button type="button" onClick={close} className="h-10 w-full rounded bg-slate-700 text-sm font-medium text-white hover:bg-slate-600">Close</button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
                <label className="block text-xs font-medium text-slate-600">
                  Subject (optional)
                  <input value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} className="mt-1 h-10 w-full rounded border border-slate-300 px-3 text-sm" />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  What went wrong?
                  <textarea value={message} maxLength={2000} onChange={(e) => { setMessage(e.target.value); setError('') }} rows={5} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                </label>
                {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={close} className="h-10 rounded border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
                  <button type="submit" disabled={busy} className="h-10 rounded bg-slate-700 px-4 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-60">{busy ? 'Sending…' : 'Send'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
