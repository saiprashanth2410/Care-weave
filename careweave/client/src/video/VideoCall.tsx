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

import { LANGUAGE_NAME } from './useSpeech'

export type CaptionControl = { on: boolean; toggle: () => void; supported: boolean; lang?: string; peerLang?: string; translating?: boolean; problem?: string }

/**
 * The call screen: the other person large, yourself small, live captions, and mute / camera / captions / hang up.
 * `layout="full"` (the patient's phone) also has a Chat button that opens a sheet over the video; in `panel` layout (doctor portal)
 * the chat lives in the side panel next to it.
 */
export default function VideoCall({ call, role, layout = 'panel', cc, onHangUp }: { call: CallApi; role: CallRole; layout?: 'panel' | 'full'; cc: CaptionControl; onHangUp?: () => void }) {
  const full = layout === 'full'
  const over = call.state === 'ended' || call.state === 'failed'
  // On a laptop the chat is a side panel that is open from the start; on a phone it is a sheet that opens on demand.
  const [chatOpen, setChatOpen] = useState(() => layout === 'full' && typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 900px)').matches)
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
    <div className={`vc ${full ? 'vc-full' : ''} ${full && chatOpen ? 'chat-open' : ''}`} data-state={call.state}>
      <div className="vc-main">
      <div className="vc-stage">
        <Video stream={call.remoteStream} className="vc-remote" label={role === 'doctor' ? 'Patient video' : 'Doctor video'} />
        {call.state !== 'connected' && (
          <div className="vc-overlay" role="status">
            <b>{STATUS[call.state](role)}</b>
            {call.error && <p className="vc-error">{call.error}</p>}
            {call.state === 'failed' && /blocked/i.test(call.error) && (
              <p className="vc-error">To allow it: tap the camera or lock icon next to the web address, choose Allow for camera and microphone, then press Try again.</p>
            )}
            {(call.state === 'connecting' || (call.state === 'failed' && call.diag.ice !== 'new')) && (
              <p className="vc-diag" aria-label="Network check">
                Network check: {call.diag.ice}. Your device found {call.diag.local.host} local, {call.diag.local.srflx} direct and {call.diag.local.relay} relay routes; the other side sent {call.diag.remote.host + call.diag.remote.srflx + call.diag.remote.relay}. {call.diag.relay ? 'A relay server is available.' : 'No relay server is configured.'}
              </p>
            )}
            {call.state === 'failed' && <button type="button" className="vc-retry" onClick={call.retry}>Try again</button>}
          </div>
        )}
        {cc.on && lines.length > 0 && (
          <div className="vc-cc" aria-live="polite" aria-label="Captions">
            {lines.map((l) => {
              const mine = l.from === role
              const who = mine ? 'You' : l.from === 'doctor' ? 'Doctor' : 'Patient'
              // What the other person said is shown in my language when it was translated, with their own words small underneath.
              return (
                <p key={l.id}>
                  <b>{who}:</b> {!mine && l.translated ? l.translated : l.text}
                  {!mine && l.translated && <small className="vc-orig">{l.text}</small>}
                  {!mine && l.translationError && <small className="vc-orig">Not translated ({l.translationError === 'ai-off' ? 'translation is switched off by the administrator' : 'the translator did not answer'})</small>}
                </p>
              )
            })}
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
      {cc.on && cc.supported && cc.lang && cc.peerLang && (
        <p className="vc-hint vc-langline">
          You speak {LANGUAGE_NAME[cc.lang] || cc.lang}. {cc.peerLang === cc.lang ? 'The other person speaks the same language.' : cc.translating ? `Captions are translated from ${LANGUAGE_NAME[cc.peerLang] || cc.peerLang}.` : `They speak ${LANGUAGE_NAME[cc.peerLang] || cc.peerLang} (translation is off).`}
        </p>
      )}
      {cc.on && cc.supported && cc.problem && <p className="vc-hint">Captions stopped: {cc.problem}. The call is not affected; press CC twice to try again, or use Chat.</p>}
      {!cc.supported && <p className="vc-hint">Live captions are not available in this browser (they need Chrome or Edge). Use Chat to type to each other.</p>}
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
