import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import VideoCall from './VideoCall'
import type { CallApi } from './useCall'

const call = (over: Partial<CallApi> = {}): CallApi => ({
  state: 'connected', error: '', retry: vi.fn(), diag: { ice: 'checking', relay: false, local: { host: 2, srflx: 1, relay: 0 }, remote: { host: 1, srflx: 0, relay: 0 } }, localStream: null, remoteStream: null, micOn: true, camOn: true,
  toggleMic: vi.fn(), toggleCam: vi.fn(), sendBye: vi.fn(), sendCaption: vi.fn(), captions: [], sendChat: vi.fn(), messages: [], ...over
} as CallApi)

const cc = (over = {}) => ({ on: true, toggle: vi.fn(), supported: true, ...over })

describe('VideoCall', () => {
  it('explains how to unblock the camera and offers Try again when permission was refused', () => {
    const c = call({ state: 'failed', error: 'Camera or microphone permission was blocked. Allow both in the browser address bar and try again.' })
    render(<VideoCall call={c} role="patient" layout="full" cc={cc()} />)
    expect(screen.getByText(/permission was blocked/i)).toBeTruthy()
    expect(screen.getByText(/choose Allow for camera and microphone/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(c.retry).toHaveBeenCalledTimes(1)
  })

  it('does not show the unblock steps for other problems, but still offers Try again', () => {
    render(<VideoCall call={call({ state: 'failed', error: 'No camera or microphone was found on this device.' })} role="doctor" cc={cc()} />)
    expect(screen.queryByText(/choose Allow/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('tells people in a browser without speech recognition to use Chat, and disables the CC button', () => {
    render(<VideoCall call={call()} role="patient" layout="full" cc={cc({ supported: false, on: true })} />)
    expect(screen.getByText(/captions are not available in this browser/i)).toBeTruthy()
    expect((screen.getByRole('button', { name: /CC/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows no Try again while the call is working', () => {
    render(<VideoCall call={call()} role="doctor" cc={cc()} />)
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.queryByText(/not available in this browser/i)).toBeNull()
  })

  it('shows a network check while connecting, so a slow call can be understood', () => {
    render(<VideoCall call={call({ state: 'connecting' })} role="patient" layout="full" cc={cc()} />)
    const line = screen.getByLabelText('Network check').textContent || ''
    expect(line).toMatch(/checking/)
    expect(line).toMatch(/2 local, 1 direct and 0 relay/)
    expect(line).toMatch(/No relay server is configured/)
  })

  it('says captions stopped, and that the call is not affected', () => {
    render(<VideoCall call={call()} role="doctor" cc={cc({ problem: "the browser's speech service could not be reached from this network" })} />)
    expect(screen.getByText(/Captions stopped: the browser's speech service/)).toBeTruthy()
    expect(screen.getByText(/The call is not affected/)).toBeTruthy()
  })
})
