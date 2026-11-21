import { useEffect, useState } from 'react'
import type { CallApi } from './useCall'
import { SPEECH_PROBLEM, speechSupported, useSpeech } from './useSpeech'

/**
 * Captions for one side of the call. Each person speaks their own language; the browser turns it into text, and when the other
 * person reads a different language the server translates it. The text is also kept for the doctor's summary.
 */
export function useCaptions(call: CallApi, initialLang = 'en-IN') {
  const [on, setOn] = useState(true)
  const [lang, setLang] = useState(initialLang)
  const [translate, setTranslate] = useState(true)
  const [problem, setProblem] = useState('')
  const supported = speechSupported()
  const ready = call.state !== 'starting'
  const { sendLang, peerLang, sendCaption } = call

  // Tell the other side which language to expect, as soon as the call is open and whenever it is changed.
  useEffect(() => { if (ready) void sendLang(lang) }, [ready, lang, sendLang])

  const to = translate && peerLang && peerLang !== lang ? peerLang : undefined
  useSpeech({ enabled: on && supported && call.micOn && call.state === 'connected', lang, onFinal: (text) => { void sendCaption(text, { lang, to }) }, onProblem: (code) => setProblem(SPEECH_PROBLEM[code] || 'speech recognition stopped') })
  // Turning captions off and on again is the way to try again after a problem.
  const toggle = () => { setProblem(''); setOn((o) => !o) }
  const changeLang = (l: string) => { setProblem(''); setLang(l) }
  return { on, toggle, problem, supported, lang, setLang: changeLang, translate, setTranslate, peerLang, translating: Boolean(to) }
}
