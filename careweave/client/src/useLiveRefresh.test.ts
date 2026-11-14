import { describe, expect, it } from 'vitest'
import { pollDecision, QUIET_POLLS_BEFORE_RELOAD } from './useLiveRefresh'

describe('pollDecision', () => {
  it('only records the first token, without reloading', () => {
    const r = pollDecision({ last: null, quiet: 0 }, 'a')
    expect(r.reload).toBe(false)
    expect(r.next).toEqual({ last: 'a', quiet: 0 })
  })

  it('reloads when the token moved, and resets the quiet count', () => {
    const r = pollDecision({ last: 'a', quiet: 5 }, 'b')
    expect(r.reload).toBe(true)
    expect(r.next).toEqual({ last: 'b', quiet: 0 })
  })

  it('stays still while nothing changed, then reloads once as a safety net', () => {
    let state = { last: 'a' as string | null, quiet: 0 }
    let reloads = 0
    for (let i = 0; i < QUIET_POLLS_BEFORE_RELOAD * 2; i++) {
      const r = pollDecision(state, 'a')
      state = r.next
      if (r.reload) reloads++
    }
    expect(reloads).toBe(2) // once per quiet spell, not once per poll
  })

  it('reloads as it always did when the server cannot give a token', () => {
    expect(pollDecision({ last: 'a', quiet: 3 }, null).reload).toBe(true)
    expect(pollDecision({ last: null, quiet: 0 }, null).reload).toBe(true)
  })

  it('keeps the last known token across a failed read, so one bad poll is not mistaken for a change', () => {
    const failed = pollDecision({ last: 'a', quiet: 2 }, null)
    expect(failed.next.last).toBe('a')
    expect(pollDecision(failed.next, 'a').reload).toBe(false)
  })
})
