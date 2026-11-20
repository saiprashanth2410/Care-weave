import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveRefresh } from '@/useLiveRefresh'
import { compressImage } from './image'
import PhotoViewer from './PhotoViewer'
import { MESSAGES_CHANGED } from './useUnreadMessages'
import './messaging.css'

type Person = { id: string; name: string; role: string; facility: string }
type Convo = { with: Person; unread: number; last: { text: string; at: number; mine: boolean } }
type Msg = { id: string; mine: boolean; text: string; imageId: string | null; at: number; read: boolean }

const ROLE: Record<string, string> = { receptionist: 'Front desk', doctor: 'Doctor', lab: 'Laboratory', admin: 'Administrator' }
const clean = (n: string) => n.replace(/\s*\(.*\)\s*$/, '').trim()
const initials = (n: string) => clean(n).replace(/^dr\.?\s+/i, '').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const listTime = (at: number) => (sameDay(new Date(at), new Date()) ? clock(at) : new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' }))
const dayLabel = (at: number) => (sameDay(new Date(at), new Date()) ? 'Today' : new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' }))

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Request failed')
  return body as T
}

function Avatar({ person, size = 44 }: { person: Person; size?: number }) {
  return <span className={`mg-avatar role-${person.role}`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">{initials(person.name)}</span>
}

/**
 * Internal messaging between staff, laid out like a chat inbox: people on the left (unread in bold), the conversation on the right.
 * Text and photos (a prescription, a report, a scan). Only the two people in a conversation can read it.
 */
export default function MessagesPage({ notify }: { notify?: (s: string) => void }) {
  const [tick, setTick] = useState(0)
  useLiveRefresh(() => setTick((t) => t + 1))

  const [convos, setConvos] = useState<Convo[] | null>(null)
  const [active, setActive] = useState<Person | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [picker, setPicker] = useState(false)
  const [contacts, setContacts] = useState<Person[]>([])
  const [pickQ, setPickQ] = useState('')
  const [viewer, setViewer] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const say = useCallback((s: string) => (notify ? notify(s) : setError(s)), [notify])

  useEffect(() => {
    getJson<Convo[]>('/api/messages/conversations').then(setConvos).catch(() => setConvos((c) => c ?? []))
  }, [tick])

  useEffect(() => {
    if (!active) return
    let live = true
    getJson<{ messages: Msg[] }>(`/api/messages/with/${active.id}`)
      .then((b) => {
        if (!live) return
        setMessages(b.messages)
        setConvos((list) => list && list.map((c) => (c.with.id === active.id ? { ...c, unread: 0 } : c)))
        window.dispatchEvent(new Event(MESSAGES_CHANGED))
      })
      .catch((e) => live && say(e.message))
      .finally(() => live && setLoadingThread(false))
    return () => { live = false }
  }, [active, tick, say])

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [messages.length, active?.id])

  const openPicker = () => {
    setPicker(true)
    setPickQ('')
    if (!contacts.length) getJson<Person[]>('/api/messages/contacts').then(setContacts).catch((e) => say(e.message))
  }

  const choose = (p: Person) => {
    setPicker(false)
    if (active?.id !== p.id) { setMessages([]); setLoadingThread(true); setActive(p) }
    setDraft(''); setPhoto(null); setError('')
  }

  const attach = async (file?: File | null) => {
    if (!file) return
    setError('')
    try { setPhoto(await compressImage(file)) } catch (e: any) { setError(e.message) }
    if (fileRef.current) fileRef.current.value = ''
  }

  const send = async () => {
    if (!active || busy || (!draft.trim() && !photo)) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/messages/with/${active.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: draft, image: photo }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not send')
      setMessages((m) => [...m, body])
      setDraft(''); setPhoto(null)
      setTick((t) => t + 1)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const shown = useMemo(() => (convos ?? []).filter((c) => !q.trim() || c.with.name.toLowerCase().includes(q.trim().toLowerCase())), [convos, q])
  const pickable = contacts.filter((p) => !pickQ.trim() || p.name.toLowerCase().includes(pickQ.trim().toLowerCase()) || (ROLE[p.role] || '').toLowerCase().includes(pickQ.trim().toLowerCase()))

  return (
    <div className="mg" data-view={active ? 'thread' : 'list'}>
      <aside className="mg-list" aria-label="Conversations">
        <div className="mg-head">
          <h2>Messaging</h2>
          <button type="button" className="mg-compose-btn" onClick={openPicker} aria-label="New message" title="New message">New message</button>
        </div>
        <div className="mg-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages" aria-label="Search conversations" /></div>
        <div className="mg-items">
          {convos === null && <p className="mg-empty">Loading…</p>}
          {convos !== null && shown.length === 0 && (
            <p className="mg-empty">{convos.length === 0 ? 'No conversations yet. Press "New message" to write to a colleague.' : 'No match.'}</p>
          )}
          {shown.map((c) => (
            <button type="button" key={c.with.id} data-person={c.with.id} className={`mg-item ${active?.id === c.with.id ? 'on' : ''} ${c.unread ? 'unread' : ''}`} onClick={() => choose(c.with)}>
              <Avatar person={c.with} />
              <span className="mg-item-body">
                <span className="mg-item-top"><b>{clean(c.with.name)}</b><time>{listTime(c.last.at)}</time></span>
                <span className="mg-role">{ROLE[c.with.role] || c.with.role}</span>
                <span className="mg-snippet">{c.last.mine ? 'You: ' : ''}{c.last.text}</span>
              </span>
              {c.unread > 0 && <span className="mg-dot" aria-label={`${c.unread} unread`}>{c.unread}</span>}
            </button>
          ))}
        </div>
      </aside>

      <section className="mg-thread" aria-label="Conversation">
        {!active ? (
          <div className="mg-placeholder"><b>Select a conversation</b><p>Or press "New message" to start one.</p></div>
        ) : (
          <>
            <header className="mg-thread-head">
              <button type="button" className="mg-back" onClick={() => setActive(null)} aria-label="Back to conversations">Back</button>
              <Avatar person={active} size={40} />
              <div><b>{clean(active.name)}</b><span>{ROLE[active.role] || active.role}{active.facility ? ` · ${active.facility}` : ''}</span></div>
            </header>
            <div className="mg-messages" role="log" aria-live="polite">
              {loadingThread && <p className="mg-empty">Loading…</p>}
              {!loadingThread && messages.length === 0 && <p className="mg-empty">No messages yet. Say hello to {clean(active.name)}.</p>}
              {messages.map((m, i) => (
                <div key={m.id}>
                  {(i === 0 || !sameDay(new Date(messages[i - 1].at), new Date(m.at))) && <div className="mg-day"><span>{dayLabel(m.at)}</span></div>}
                  <div className={`mg-msg ${m.mine ? 'me' : 'them'}`}>
                    {m.imageId && (
                      <button type="button" className="mg-photo" onClick={() => setViewer(`/api/messages/image/${m.imageId}`)} aria-label="Open photo">
                        <img src={`/api/messages/image/${m.imageId}`} alt="Photo in message" loading="lazy" />
                      </button>
                    )}
                    {m.text && <span className="mg-text">{m.text}</span>}
                    <time>{clock(m.at)}{m.mine && m.read ? ' · Seen' : ''}</time>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div className="mg-compose">
              {photo && (
                <div className="mg-pending">
                  <img src={photo} alt="Photo to send" />
                  <button type="button" onClick={() => setPhoto(null)} aria-label="Remove photo">Remove</button>
                </div>
              )}
              {error && <p className="mg-error" role="alert">{error}</p>}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
                placeholder="Write a message…"
                aria-label="Message"
                maxLength={2000}
                rows={2}
              />
              <div className="mg-compose-bar">
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void attach(e.target.files?.[0])} aria-label="Attach a photo" />
                <button type="button" className="mg-attach" onClick={() => fileRef.current?.click()} disabled={busy}>Photo</button>
                <span className="mg-hint">Enter to send, Shift+Enter for a new line</span>
                <button type="button" className="mg-send" onClick={() => void send()} disabled={busy || (!draft.trim() && !photo)}>{busy ? 'Sending…' : 'Send'}</button>
              </div>
            </div>
          </>
        )}
      </section>

      {picker && (
        <div className="mg-modal" role="dialog" aria-label="New message" onClick={() => setPicker(false)}>
          <div className="mg-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="mg-modal-head"><b>New message</b><button type="button" onClick={() => setPicker(false)}>Close</button></div>
            <input value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder="Search by name or role" aria-label="Search people" autoFocus />
            <div className="mg-pick">
              {pickable.length === 0 && <p className="mg-empty">No one found.</p>}
              {pickable.map((p) => (
                <button type="button" key={p.id} data-person={p.id} onClick={() => choose(p)}>
                  <Avatar person={p} size={36} />
                  <span><b>{clean(p.name)}</b><small>{ROLE[p.role] || p.role}{p.facility ? ` · ${p.facility}` : ''}</small></span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {viewer && <PhotoViewer src={viewer} onClose={() => setViewer(null)} />}
    </div>
  )
}
