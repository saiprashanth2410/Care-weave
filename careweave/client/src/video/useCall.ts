import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * One-to-one video call between the doctor and a patient, straight browser to browser (WebRTC).
 * The two browsers find each other by leaving small messages on the server and polling for the other side's,
 * because the host (Vercel) cannot keep a socket open. The video itself never goes through the server.
 *
 * Order of events: the patient says "ready"; the doctor answers with an offer; the patient replies with an answer;
 * both sides then trade network candidates until a path is found. Every message carries a session id that the patient
 * makes when the page opens, so a patient who reloads simply starts a fresh session and the doctor follows.
 */

export type CallRole = 'doctor' | 'patient'
export type CallState = 'starting' | 'waiting' | 'connecting' | 'connected' | 'ended' | 'failed'
export type Caption = { id: string; from: CallRole; text: string; at: number }

type Signal = { id: string; at: number; type: 'ready' | 'offer' | 'answer' | 'ice' | 'bye' | 'caption'; data: any }

const POLL_MS = 1000
const READY_MS = 2000
const GIVE_UP_MS = 30_000

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
  const env = import.meta.env as Record<string, string | undefined>
  // A relay (TURN) makes the call work on networks that block direct paths. Optional: set all three at build time.
  if (env.VITE_TURN_URL && env.VITE_TURN_USERNAME && env.VITE_TURN_CREDENTIAL) {
    servers.push({ urls: env.VITE_TURN_URL.split(','), username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL })
  }
  return servers
}

export function describeMediaError(err: unknown): string {
  const name = (err as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera or microphone permission was blocked. Allow both in the browser address bar and try again.'
  if (name === 'NotFoundError') return 'No camera or microphone was found on this device.'
  if (name === 'NotReadableError') return 'The camera or microphone is being used by another app. Close it and try again.'
  return 'Could not start the camera and microphone.'
}

export function useCall(opts: { token: string; role: CallRole; doctorKey?: string; enabled: boolean }) {
  const { token, role, doctorKey, enabled } = opts
  const [state, setState] = useState<CallState>('starting')
  const [error, setError] = useState('')
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [captions, setCaptions] = useState<Caption[]>([])
  const localRef = useRef<MediaStream | null>(null)
  const sendRef = useRef<(type: Signal['type'], data: unknown) => Promise<void>>(async () => {})

  useEffect(() => {
    if (!enabled) return
    let alive = true
    let pc: RTCPeerConnection | null = null
    let session = ''
    let lastAt = 0
    let readyTimer: ReturnType<typeof setInterval> | undefined
    let pollTimer: ReturnType<typeof setInterval> | undefined
    let giveUp: ReturnType<typeof setTimeout> | undefined
    const seen = new Set<string>()
    let pending: RTCIceCandidateInit[] = []
    const mySession = role === 'patient' ? crypto.randomUUID() : ''
    const base = `/api/video/public/${encodeURIComponent(token)}`

    const send = async (type: Signal['type'], data: unknown) => {
      try {
        await fetch(`${base}/signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, key: doctorKey, type, data })
        })
      } catch { /* the next poll or retry carries on */ }
    }
    sendRef.current = send

    const newPeer = () => {
      pc?.close()
      pending = []
      const peer = new RTCPeerConnection({ iceServers: iceServers() })
      pc = peer
      localRef.current?.getTracks().forEach((t) => peer.addTrack(t, localRef.current!))
      const remote = new MediaStream()
      peer.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => { if (!remote.getTracks().includes(t)) remote.addTrack(t) })
        if (alive) setRemoteStream(new MediaStream(remote.getTracks()))
      }
      peer.onicecandidate = (e) => { if (e.candidate) void send('ice', { session, candidate: e.candidate.toJSON() }) }
      peer.onconnectionstatechange = () => {
        if (!alive) return
        if (peer.connectionState === 'connected') {
          clearTimeout(giveUp)
          clearInterval(readyTimer)
          setState('connected')
        } else if (peer.connectionState === 'failed') {
          setState('failed')
          setError('The two devices could not connect directly. Try the same Wi-Fi or switch one side to mobile data.')
        }
      }
      return peer
    }

    const flushIce = async () => {
      if (!pc?.remoteDescription) return
      const list = pending
      pending = []
      for (const c of list) await pc.addIceCandidate(c).catch(() => {})
    }

    const handle = async (s: Signal) => {
      if (s.type === 'bye') { setState('ended'); return }
      if (s.type === 'caption') {
        const text = String(s.data?.text || '').slice(0, 400)
        if (text) setCaptions((c) => [...c.slice(-19), { id: s.id, from: role === 'doctor' ? 'patient' : 'doctor', text, at: s.at }])
        return
      }
      if (role === 'doctor') {
        if (s.type === 'ready') {
          const sid = String(s.data?.session || '')
          if (!sid || sid === session) return
          session = sid
          setState('connecting')
          const peer = newPeer()
          const offer = await peer.createOffer()
          await peer.setLocalDescription(offer)
          await send('offer', { session, sdp: offer.sdp })
        } else if (s.type === 'answer' && s.data?.session === session && pc && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription({ type: 'answer', sdp: s.data.sdp })
          await flushIce()
        } else if (s.type === 'ice' && s.data?.session === session) {
          pending.push(s.data.candidate)
          await flushIce()
        }
      } else {
        if (s.type === 'offer' && s.data?.session === mySession && pc && !pc.currentRemoteDescription) {
          clearInterval(readyTimer)
          setState('connecting')
          await pc.setRemoteDescription({ type: 'offer', sdp: s.data.sdp })
          await flushIce()
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          await send('answer', { session: mySession, sdp: answer.sdp })
        } else if (s.type === 'ice' && s.data?.session === mySession) {
          pending.push(s.data.candidate)
          await flushIce()
        }
      }
    }

    const poll = async () => {
      try {
        const q = new URLSearchParams({ role, since: String(Math.max(0, lastAt - 1500)) })
        if (doctorKey) q.set('key', doctorKey)
        const res = await fetch(`${base}/signals?${q}`)
        if (res.status === 410) { if (alive) setState('ended'); return }
        if (!res.ok) return
        const body = (await res.json()) as { signals: Signal[] }
        for (const s of body.signals) {
          if (seen.has(s.id)) continue
          seen.add(s.id)
          lastAt = Math.max(lastAt, s.at)
          await handle(s).catch(() => {})
        }
      } catch { /* offline for a moment: the next poll tries again */ }
    }

    ;(async () => {
      try {
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: { echoCancellation: true, noiseSuppression: true } })
        } catch (err) {
          // No camera: carry on with sound only rather than refusing the consultation.
          if ((err as { name?: string })?.name === 'NotFoundError') stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          else throw err
        }
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return }
        localRef.current = stream
        setLocalStream(stream)
        setCamOn(stream.getVideoTracks().length > 0)
        setState('waiting')
        if (role === 'patient') {
          session = mySession
          newPeer()
          const ready = () => send('ready', { session: mySession })
          void ready()
          readyTimer = setInterval(ready, READY_MS)
        }
        pollTimer = setInterval(poll, POLL_MS)
        void poll()
        giveUp = setTimeout(() => {
          if (!alive) return
          setState((s) => {
            if (s === 'connected' || s === 'ended') return s
            setError(role === 'patient' ? 'The doctor has not joined yet. Keep this page open.' : 'The patient has not opened the link yet.')
            return s
          })
        }, GIVE_UP_MS)
      } catch (err) {
        if (alive) { setState('failed'); setError(describeMediaError(err)) }
      }
    })()

    return () => {
      alive = false
      clearInterval(readyTimer)
      clearInterval(pollTimer)
      clearTimeout(giveUp)
      pc?.close()
      localRef.current?.getTracks().forEach((t) => t.stop())
      localRef.current = null
    }
  }, [enabled, token, role, doctorKey])

  const toggleMic = useCallback(() => {
    const on = !micOn
    localRef.current?.getAudioTracks().forEach((t) => { t.enabled = on })
    setMicOn(on)
  }, [micOn])

  const toggleCam = useCallback(() => {
    const on = !camOn
    localRef.current?.getVideoTracks().forEach((t) => { t.enabled = on })
    setCamOn(on)
  }, [camOn])

  /** Tells the other side the call is over. Safe to call more than once. */
  const sendBye = useCallback(() => sendRef.current('bye', null), [])
  const sendCaption = useCallback((text: string) => sendRef.current('caption', { text }), [])

  return { state, error, localStream, remoteStream, micOn, camOn, toggleMic, toggleCam, sendBye, sendCaption, captions }
}
