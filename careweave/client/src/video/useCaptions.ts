import { useState } from 'react'
import type { CallApi } from './useCall'
import { speechSupported, useSpeech } from './useSpeech'

/** Captions for one side of the call: turns this person's speech into text, shows it to both, and keeps it for the doctor's summary. */
export function useCaptions(call: CallApi, initialLang = 'en-IN') {
  const [on, setOn] = useState(true)
  const [lang, setLang] = useState(initialLang)
  const supported = speechSupported()
  useSpeech({ enabled: on && supported && call.micOn && call.state === 'connected', lang, onFinal: (text) => { void call.sendCaption(text) } })
  return { on, toggle: () => setOn((o) => !o), supported, lang, setLang }
}
