import { useEffect, useRef } from 'react'
import { useCall, type CallRole, type CallState } from './useCall'
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

/** The call screen: the other person large, yourself small, and mute / camera / hang up. Used by the doctor portal and the patient link. */
export default function VideoCall({ token, role, doctorKey, layout = 'panel', onHangUp }: { token: string; role: CallRole; doctorKey?: string; layout?: 'panel' | 'full'; onHangUp?: () => void }) {
  const call = useCall({ token, role, doctorKey, enabled: true })
  const over = call.state === 'ended' || call.state === 'failed'

  const hangUp = () => {
    void call.sendBye()
    onHangUp?.()
  }

  return (
    <div className={`vc ${layout === 'full' ? 'vc-full' : ''}`} data-state={call.state}>
      <div className="vc-stage">
        <Video stream={call.remoteStream} className="vc-remote" label={role === 'doctor' ? 'Patient video' : 'Doctor video'} />
        {call.state !== 'connected' && (
          <div className="vc-overlay" role="status">
            <b>{STATUS[call.state](role)}</b>
            {call.error && <p className="vc-error">{call.error}</p>}
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
        <button type="button" className="vc-end" onClick={hangUp} disabled={over && role === 'patient'}>
          {role === 'doctor' ? 'End consultation' : 'Leave'}
        </button>
      </div>
    </div>
  )
}
