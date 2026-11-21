import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import VideoCall from './VideoCall'
import { useCall } from './useCall'
import { useCaptions } from './useCaptions'
import { CAPTION_LANGUAGES } from './useSpeech'
import './video.css'

type Info = { doctorName: string; patientFirstName: string; expiresAt: string }

function PatientCall({ token, lang, onLeft }: { token: string; lang: string; onLeft: () => void }) {
  const call = useCall({ token, role: 'patient', enabled: true })
  const cc = useCaptions(call, lang)
  return <VideoCall call={call} role="patient" layout="full" cc={cc} onHangUp={onLeft} />
}

/** The page a patient opens from the WhatsApp link. No sign-in: the long random token in the address is the key. */
export default function VideoConsultPublic() {
  const { token = '' } = useParams()
  const [info, setInfo] = useState<Info | null>(null)
  const [problem, setProblem] = useState('')
  const [joined, setJoined] = useState(false)
  const [left, setLeft] = useState(false)
  const [lang, setLang] = useState('en-IN')

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
          <label className="vc-lang">
            <span>Language you will speak</span>
            <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language you will speak">
              {CAPTION_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
          <button type="button" className="vc-join" onClick={() => setJoined(true)}>Join the video call</button>
          <p className="vc-note">Your browser will ask to use the camera and microphone. Please allow both. During the call your speech is turned into text captions so the doctor can follow and keep notes. If the doctor speaks another language, an AI translates the captions for you. You can switch captions off with the CC button.</p>
        </div>
      )}
      {info && joined && !left && <PatientCall token={token} lang={lang} onLeft={() => setLeft(true)} />}
      {left && <div className="vc-card"><b>You left the consultation.</b><p>You can close this page.</p></div>}
    </main>
  )
}
