import { useEffect, useRef } from 'react'

/** Languages offered for captions. The code is what the browser's speech recognition expects. */
export const CAPTION_LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'ta-IN', label: 'தமிழ் (Tamil)' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)' }
] as const

/** Short names for showing a language to people. */
export const LANGUAGE_NAME: Record<string, string> = { 'en-IN': 'English', 'ta-IN': 'தமிழ் (Tamil)', 'hi-IN': 'हिन्दी (Hindi)' }

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start(): void; abort(): void
}
type RecognitionCtor = new () => Recognition

const ctor = (): RecognitionCtor | undefined =>
  typeof window === 'undefined' ? undefined : ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition)

/** Chrome and Edge (desktop and Android) can turn speech into text; Firefox and most iPhone browsers cannot. */
export const speechSupported = () => Boolean(ctor())

/** Why captions stopped, in words a person can act on. The call itself is never affected. */
export const SPEECH_PROBLEM: Record<string, string> = {
  'not-allowed': 'the browser did not allow speech recognition (microphone permission)',
  'service-not-allowed': 'the browser did not allow speech recognition',
  'audio-capture': 'the microphone could not be used for captions',
  'language-not-supported': 'this browser cannot recognise the chosen language',
  network: "the browser's speech service could not be reached from this network",
  'restart-loop': 'speech recognition kept stopping'
}
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported', 'network'])

/**
 * Listens to this device's microphone and hands each finished sentence to `onFinal`. It restarts itself after a pause in speech, but
 * gives up (and says why through `onProblem`) on a real error or if it keeps stopping, so a failing caption service can never loop
 * and slow the call down.
 */
export function useSpeech({ enabled, lang, onFinal, onProblem }: { enabled: boolean; lang: string; onFinal: (text: string) => void; onProblem?: (code: string) => void }) {
  const finalRef = useRef(onFinal)
  const problemRef = useRef(onProblem)
  useEffect(() => { finalRef.current = onFinal; problemRef.current = onProblem }, [onFinal, onProblem])

  useEffect(() => {
    const Ctor = ctor()
    if (!enabled || !Ctor) return
    const rec = new Ctor()
    let stopped = false
    let restarts: number[] = []
    let timer: ReturnType<typeof setTimeout> | undefined
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim()
          if (text) finalRef.current(text)
        }
      }
    }
    const giveUp = (code: string) => { stopped = true; problemRef.current?.(code) }
    rec.onerror = (e) => { if (FATAL.has(e.error)) giveUp(e.error) } // "no-speech" and "aborted" are normal pauses
    rec.onend = () => {
      if (stopped) return
      const now = Date.now()
      restarts = restarts.filter((t) => now - t < 10_000)
      if (restarts.length >= 6) return giveUp('restart-loop')
      restarts.push(now)
      timer = setTimeout(() => { if (!stopped) try { rec.start() } catch { /* already starting */ } }, 250)
    }
    try { rec.start() } catch { /* the browser refused to start; captions stay off */ }
    return () => { stopped = true; clearTimeout(timer); try { rec.abort() } catch { /* already stopped */ } }
  }, [enabled, lang])
}
