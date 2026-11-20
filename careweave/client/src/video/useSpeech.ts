import { useEffect, useRef } from 'react'

/** Languages offered for captions. The code is what the browser's speech recognition expects. */
export const CAPTION_LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'ta-IN', label: 'தமிழ் (Tamil)' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)' }
] as const

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

/**
 * Listens to this device's microphone and hands each finished sentence to `onFinal`. It restarts itself when the browser stops
 * listening after a pause, and stops for good if the permission is refused.
 */
export function useSpeech({ enabled, lang, onFinal }: { enabled: boolean; lang: string; onFinal: (text: string) => void }) {
  const finalRef = useRef(onFinal)
  useEffect(() => { finalRef.current = onFinal }, [onFinal])

  useEffect(() => {
    const Ctor = ctor()
    if (!enabled || !Ctor) return
    const rec = new Ctor()
    let stopped = false
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
    rec.onend = () => { if (!stopped) try { rec.start() } catch { /* already starting */ } }
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') stopped = true }
    try { rec.start() } catch { /* the browser refused to start; captions stay off */ }
    return () => { stopped = true; try { rec.abort() } catch { /* already stopped */ } }
  }, [enabled, lang])
}
