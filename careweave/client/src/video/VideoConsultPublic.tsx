import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import VideoCall from './VideoCall'
import './video.css'

type Info = { doctorName: string; patientFirstName: string; expiresAt: string }

/** The page a patient opens from the WhatsApp link. No sign-in: the long random token in the address is the key. */
export default function VideoConsultPublic() {
  const { token = '' } = useParams()
  const [info, setInfo] = useState<Info | null>(null)
  const [problem, setProblem] = useState('')
  const [joined, setJoined] = useState(false)
  const [left, setLeft] = useState(false)

  useEffect(() => {
    document.title = 'CareWeave video consultation'
    let alive = true
    fetch(`/api/video/public/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!alive) return
        if (!r.ok) setProblem(body.error || 'This video link is not valid.')
        else setInfo(body)
      })
      .catch(() => alive && setProblem('Could not reach the server. Check your internet connection and reload.'))
    return () => { alive = false }
  }, [token])

  return (
    <main className={`vc-page ${joined && !left ? 'in-call' : ''}`}>
      <h1>CareWeave video consultation</h1>
      {problem && <div className="vc-card" role="alert"><b>{problem}</b></div>}
      {!problem && !info && <p role="status">Checking your link…</p>}
      {info && !joined && (
        <div className="vc-card">
          <p>Hello {info.patientFirstName},</p>
          <b>{info.doctorName} is ready to see you on video.</b>
          <button type="button" className="vc-join" onClick={() => setJoined(true)}>Join the video call</button>
          <p className="vc-note">Your browser will ask to use the camera and microphone. Please allow both. Keep this page open during the call.</p>
        </div>
      )}
      {info && joined && !left && <VideoCall token={token} role="patient" layout="full" onHangUp={() => setLeft(true)} />}
      {left && <div className="vc-card"><b>You left the consultation.</b><p>You can close this page.</p></div>}
    </main>
  )
}
