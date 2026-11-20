import { useEffect, useRef, useState } from 'react'
import { compressImage } from '@/messaging/image'
import PhotoViewer from '@/messaging/PhotoViewer'
import type { CallRole, ChatMsg } from './useCall'

/** Typed chat during the call, with photos (a prescription, a lab report, a rash). Messages live for the call and in its transcript. */
export default function ChatPanel({ messages, role, onSend }: { messages: ChatMsg[]; role: CallRole; onSend: (text: string, image?: string) => void }) {
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [viewer, setViewer] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [messages.length])

  const attach = async (file?: File | null) => {
    if (!file) return
    setError('')
    try { setPhoto(await compressImage(file)) } catch (e) { setError((e as Error).message) }
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() && !photo) return
    onSend(text, photo ?? undefined)
    setText('')
    setPhoto(null)
  }

  return (
    <div className="vc-chatpanel">
      <div className="vc-messages" role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 && <p className="vc-empty">No messages yet. Type below, or send a photo of a prescription or report.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`vc-msg ${m.from === role ? 'me' : 'them'}`}>
            <span className="vc-who">{m.from === role ? 'You' : m.from === 'doctor' ? 'Doctor' : 'Patient'}</span>
            {m.image && (
              <button type="button" className="vc-photo" onClick={() => setViewer(m.image!)} aria-label="Open photo">
                <img src={m.image} alt="Photo in chat" />
              </button>
            )}
            {m.text && <span className="vc-text">{m.text}</span>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {photo && (
        <div className="vc-pending">
          <img src={photo} alt="Photo to send" />
          <button type="button" onClick={() => setPhoto(null)}>Remove</button>
        </div>
      )}
      {error && <p className="vc-chat-error" role="alert">{error}</p>}
      <form className="vc-compose" onSubmit={submit}>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void attach(e.target.files?.[0])} aria-label="Attach a photo" />
        <button type="button" className="vc-attach" onClick={() => fileRef.current?.click()} aria-label="Send a photo">Photo</button>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Type a message" aria-label="Chat message" autoComplete="off" />
        <button type="submit" disabled={!text.trim() && !photo}>Send</button>
      </form>
      {viewer && <PhotoViewer src={viewer} onClose={() => setViewer(null)} />}
    </div>
  )
}
