import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSpeech } from './useSpeech'

// A stand-in for the browser's speech recogniser that the test controls.
let instances: FakeRecognition[] = []
class FakeRecognition {
  lang = ''; continuous = false; interimResults = false
  onresult: ((e: unknown) => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  starts = 0; aborted = false
  constructor() { instances.push(this) }
  start() { this.starts += 1 }
  abort() { this.aborted = true }
}

beforeEach(() => {
  instances = []
  vi.useFakeTimers()
  ;(window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition
})
afterEach(() => { vi.useRealTimers(); delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition })

const mount = (onProblem = vi.fn(), onFinal = vi.fn()) => ({ onProblem, onFinal, ...renderHook(() => useSpeech({ enabled: true, lang: 'ta-IN', onFinal, onProblem })) })

describe('useSpeech', () => {
  it('passes finished sentences on and ignores half-finished ones', () => {
    const { onFinal } = mount()
    instances[0].onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: 'hel' } }, { isFinal: true, 0: { transcript: '  hello doctor ' } }] })
    expect(onFinal).toHaveBeenCalledTimes(1)
    expect(onFinal).toHaveBeenCalledWith('hello doctor')
    expect(instances[0].lang).toBe('ta-IN')
  })

  it('restarts after a normal pause in speech', () => {
    const { onProblem } = mount()
    instances[0].onerror?.({ error: 'no-speech' })
    instances[0].onend?.()
    vi.advanceTimersByTime(300)
    expect(instances[0].starts).toBe(2)
    expect(onProblem).not.toHaveBeenCalled()
  })

  it('stops for good on a real error and says why, instead of retrying', () => {
    const { onProblem } = mount()
    instances[0].onerror?.({ error: 'network' })
    instances[0].onend?.()
    vi.advanceTimersByTime(5000)
    expect(instances[0].starts).toBe(1)
    expect(onProblem).toHaveBeenCalledWith('network')
  })

  it('gives up if the recogniser keeps stopping, so it can never spin and slow the call', () => {
    const { onProblem } = mount()
    for (let i = 0; i < 20; i++) { instances[0].onend?.(); vi.advanceTimersByTime(300) }
    expect(instances[0].starts).toBeLessThanOrEqual(7)
    expect(onProblem).toHaveBeenCalledWith('restart-loop')
  })

  it('stops listening when it is unmounted', () => {
    const { unmount } = mount()
    unmount()
    expect(instances[0].aborted).toBe(true)
    instances[0].onend?.()
    vi.advanceTimersByTime(1000)
    expect(instances[0].starts).toBe(1)
  })
})
