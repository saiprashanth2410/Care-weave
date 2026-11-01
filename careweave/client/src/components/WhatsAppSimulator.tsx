import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'

type Msg = { from: 'me' | 'bot'; text: string }
type Pt = { name: string; uhid: string; phone: string }
type Push = { seq: number; phone: string; text: string }

const authed = () => {
  try { return !!localStorage.getItem('cw_token') } catch { return false }
}
const call = async <T,>(url: string, body?: unknown): Promise<T> => {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('cw_token')}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error('request failed')
  return res.json()
}

const digits = (v: string) => v.replace(/\D/g, '').slice(-10)

/** Floating phone that talks to the same WhatsApp logic the real bot uses, for demos with no Twilio or Meta number. */
export default function WhatsAppSimulator() {
  useLocation() // re-render on navigation, so the widget appears right after sign-in and goes away on sign-out
  const [open, setOpen] = useState(false)
  const [patients, setPatients] = useState<Pt[]>([])
  const [phone, setPhone] = useState('')
  const [chat, setChat] = useState<Msg[]>([])
  const [unread, setUnread] = useState(0)
  const [input, setInput] = useState('')
  const seen = useRef<number | null>(null)
  const phoneRef = useRef('')
  const end = useRef<HTMLDivElement>(null)
  phoneRef.current = phone

  useEffect(() => {
    if (!open || patients.length || !authed()) return
    call<Pt[]>('/api/whatsapp/simulator/patients').then((p) => { setPatients(p); setPhone((cur) => cur || p[0]?.phone || '') }).catch(() => {})
  }, [open, patients.length])

  // Push notifications: events the server emitted (token issued, lab verified, medicine prescribed) for the chosen number.
  useEffect(() => {
    const tick = async () => {
      if (!authed()) return
      try {
        const events = await call<Push[]>(`/api/whatsapp/simulator/events?since=${seen.current ?? 0}`)
        if (seen.current === null) { seen.current = events.at(-1)?.seq ?? 0; return } // skip anything from before this page opened
        for (const e of events) {
          seen.current = Math.max(seen.current, e.seq)
          if (digits(e.phone || '') && digits(e.phone) === digits(phoneRef.current)) {
            setChat((c) => [...c, { from: 'bot', text: e.text }])
            setUnread((n) => n + 1)
          }
        }
      } catch { /* the simulator is optional; stay quiet */ }
    }
    tick()
    const t = setInterval(tick, 4000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { if (open) setUnread(0) }, [open, chat.length])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [chat, open])

  const send = useCallback(async (text: string) => {
    const msg = text.trim()
    if (!msg || !phone) return
    setChat((c) => [...c, { from: 'me', text: msg }])
    setInput('')
    try {
      const r = await call<{ reply: string }>('/api/whatsapp/simulate', { phone, message: msg })
      setChat((c) => [...c, { from: 'bot', text: r.reply }])
    } catch {
      setChat((c) => [...c, { from: 'bot', text: 'The bot could not be reached.' }])
    }
  }, [phone])

  if (!authed()) return null

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden">
      {open ? (
        <div className="flex h-[30rem] w-72 flex-col overflow-hidden rounded-2xl border border-neutral-300 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-[#075e54] px-3 py-2 text-white">
            <div className="min-w-0">
              <p className="text-sm font-semibold">CareWeave Bot</p>
              <p className="text-[10px] opacity-80">WhatsApp Patient Simulator</p>
            </div>
            <button type="button" aria-label="Close simulator" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <select
            aria-label="Simulated patient phone"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setChat([]) }}
            className="border-b border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-800"
          >
            {patients.map((p) => <option key={p.uhid} value={p.phone}>{p.name} · {p.phone}</option>)}
          </select>
          <div className="flex-1 space-y-2 overflow-y-auto bg-[#ece5dd] p-2 text-xs">
            {!chat.length && <p className="rounded bg-white/70 p-2 text-neutral-600">Send QUEUE, REPORT or MEDS. Alerts for this patient appear here when a token is issued, a lab report is verified or a medicine is prescribed.</p>}
            {chat.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                <p className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-2 py-1.5 text-neutral-900 shadow-sm ${m.from === 'me' ? 'bg-[#dcf8c6]' : 'bg-white'}`}>{m.text}</p>
              </div>
            ))}
            <div ref={end} />
          </div>
          <div className="flex flex-wrap gap-1 border-t border-neutral-200 bg-neutral-50 px-2 pt-1">
            {['QUEUE', 'REPORT', 'MEDS', 'LANG TA', 'LANG EN'].map((k) => (
              <button key={k} type="button" onClick={() => send(k)} className="rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-700 hover:bg-neutral-100">{k}</button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="flex gap-1 bg-neutral-50 p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message"
              aria-label="Message"
              className="min-w-0 flex-1 rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-900"
            />
            <button type="submit" className="rounded-full bg-[#075e54] px-3 text-xs font-semibold text-white">Send</button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open WhatsApp Patient Simulator"
          className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#25d366] text-white shadow-lg"
        >
          <MessageCircle size={22} />
          {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-[10px] font-bold">{unread}</span>}
        </button>
      )}
    </div>
  )
}
