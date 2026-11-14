import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ReportIssue from './ReportIssue'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { vi.unstubAllGlobals() })

const mount = () => render(<MemoryRouter initialEntries={['/doctor']}><ReportIssue /></MemoryRouter>)

describe('ReportIssue', () => {
  it('opens a form from the button and closes it again', async () => {
    const user = userEvent.setup()
    mount()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Report an issue' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks for a description before sending anything', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Report an issue' }))
    await user.type(screen.getByLabelText('What went wrong?'), 'no')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/few words/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the subject, the message and the page it was sent from, then confirms', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'msg-1' }) })
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Report an issue' }))
    await user.type(screen.getByLabelText(/Subject/), 'Lab list empty')
    await user.type(screen.getByLabelText('What went wrong?'), 'The lab orders list is empty since morning')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Sent. The administrator will follow up.')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/support/issue')
    expect(JSON.parse(init.body)).toEqual({ subject: 'Lab list empty', message: 'The lab orders list is empty since morning', page: '/doctor' })
  })

  it('shows the server\'s reason when sending fails, and keeps what was typed', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Too many attempts. Wait a few minutes and try again.' }) })
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByRole('button', { name: 'Report an issue' }))
    await user.type(screen.getByLabelText('What went wrong?'), 'Something is wrong with this page')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many attempts/)
    expect(screen.getByLabelText('What went wrong?')).toHaveValue('Something is wrong with this page')
  })
})
