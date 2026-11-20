import { useEffect, useRef, useState } from 'react'
import ChatPanel from './ChatPanel'
import type { CallApi, CallRole, CallState } from './useCall'
import './video.css'

const STATUS: Record<CallState, (role: CallRole) => string> = {
  starting: () => 'Starting your camera and microphone…',
  waiting: (role) => (role === 'doctor' ? 'Waiting for the patient to open the link…' : 'Waiting for the doctor to join…'),
  connecting: () => 'Connecting…',
  connected: () => 'Connected',
  ended: () => 'The consultation has ended.',
  failed: () => 'The call could not start.'
}

function Video({ stream, muted, className, label }: { stream: MediaStream | null; muted?: boolean; className: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream
  }, [stream])
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} aria-label={label} />
}

export type CaptionControl = { on: boolean; toggle: () => void; supported: boolean }

/**
 * The call screen: the other person large, yourself small, live captions, and mute / camera / captions / hang up.
 * `layout="full"` (the patient's phone) also has a Chat button that opens a sheet over the video; in `panel` layout (doctor portal)
 * the chat lives in the side panel next to it.
 */
export default function VideoCall({ call, role, layout = 'panel', cc, onHangUp }: { call: CallApi; role: CallRole; layout?: 'panel' | 'full'; cc: CaptionControl; onHangUp?: () => void }) {
  const full = layout === 'full'
  const over = call.state === 'ended' || call.state === 'failed'
  const [chatOpen, setChatOpen] = useState(false)
  const [seen, setSeen] = useState(0)
  const incoming = call.messages.filter((m) => m.from !== role).length
  const unread = chatOpen ? 0 : Math.max(0, incoming - seen)
  const toggleChat = () => { setSeen(incoming); setChatOpen((o) => !o) }
  const lines = call.captions.slice(-2)

  const hangUp = () => {
    void call.sendBye()
    onHangUp?.()
  }

  return (
    <div className={`vc ${full ? 'vc-full' : ''}`} data-state={call.state}>
      <div className="vc-stage">
        <Video stream={call.remoteStream} className="vc-remote" label={role === 'doctor' ? 'Patient video' : 'Doctor video'} />
        {call.state !== 'connected' && (
          <div className="vc-overlay" role="status">
            <b>{STATUS[call.state](role)}</b>
            {call.error && <p className="vc-error">{call.error}</p>}
          </div>
        )}
        {cc.on && lines.length > 0 && (
          <div className="vc-cc" aria-live="polite" aria-label="Captions">
            {lines.map((l) => <p key={l.id}><b>{l.from === role ? 'You' : l.from === 'doctor' ? 'Doctor' : 'Patient'}:</b> {l.text}</p>)}
          </div>
        )}
        <Video stream={call.localStream} muted className={`vc-local ${call.camOn ? '' : 'vc-cam-off'}`} label="Your video" />
      </div>
      <div className="vc-bar">
        <button type="button" className={call.micOn ? '' : 'vc-off'} onClick={call.toggleMic} disabled={!call.localStream} aria-pressed={!call.micOn}>
          {call.micOn ? 'Mute' : 'Unmute'}
        </button>
        <button type="button" className={call.camOn ? '' : 'vc-off'} onClick={call.toggleCam} disabled={!call.localStream || !call.localStream.getVideoTracks().length} aria-pressed={!call.camOn}>
          {call.camOn ? 'Camera off' : 'Camera on'}
        </button>
        <button type="button" className={cc.on ? 'vc-on' : ''} onClick={cc.toggle} disabled={!cc.supported} aria-pressed={cc.on} title={cc.supported ? '' : 'Captions need Chrome or Edge'}>
          {cc.on ? 'CC on' : 'CC off'}
        </button>
        {full && (
          <button type="button" className={chatOpen ? 'vc-on' : ''} onClick={toggleChat} aria-pressed={chatOpen}>
            Chat{unread > 0 && <span className="vc-badge">{unread}</span>}
          </button>
        )}
        <button type="button" className="vc-end" onClick={hangUp} disabled={over && role === 'patient'}>
          {role === 'doctor' ? 'End' : 'Leave'}
        </button>
      </div>
      {full && chatOpen && (
        <div className="vc-sheet">
          <div className="vc-sheet-head"><b>Chat</b><button type="button" onClick={toggleChat} aria-label="Close chat">Close</button></div>
          <ChatPanel messages={call.messages} role={role} onSend={(t, img) => void call.sendChat(t, img)} />
        </div>
      )}
    </div>
  )
}
