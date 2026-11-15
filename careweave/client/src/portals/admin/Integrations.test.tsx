import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('./api', () => ({
  adminApi: { gemini: vi.fn(), saveGemini: vi.fn(), unlockGemini: vi.fn(), changeGeminiPasscode: vi.fn(), removeGemini: vi.fn(), geminiOptions: vi.fn(), testGemini: vi.fn() },
}))

import { Integrations } from './Integrations'
import { adminApi } from './api'

const KEY = 'AIzaSyTestKeyForCareWeave1234567890abcd'
const status = (over: object = {}) => ({
  configured: false, source: 'none', last4: '', hasPasscode: false, model: '', features: { scan: true, brief: true }, updatedAt: null, updatedBy: '', lockedUntil: null, ...over,
})
const saved = status({ configured: true, source: 'admin', last4: 'abcd', hasPasscode: true, updatedAt: '2026-11-15T10:00:00Z', updatedBy: 'Ravi (u-1)' })

const open = async (s: object) => {
  vi.mocked(adminApi.gemini).mockResolvedValue(s as never)
  const notify = vi.fn()
  render(<Integrations notify={notify} />)
  await screen.findByText('Google Gemini AI')
  return { notify }
}
const box = () => screen.getByLabelText(/Google Gemini API key/) as HTMLInputElement

beforeEach(() => { Object.values(adminApi).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset()) })

describe('Integrations: Gemini key', () => {
  it('with no key: the box is open, the status says not configured, and the switches are off', async () => {
    await open(status())
    expect(screen.getByText('Not configured')).toBeInTheDocument()
    expect(box()).not.toHaveAttribute('readonly')
    expect(screen.getByRole('switch', { name: 'Laboratory report scanner' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove key' })).toBeDisabled()
  })

  it('first save asks for a passcode twice, refuses a mismatch, then saves and locks the key', async () => {
    const user = userEvent.setup()
    const { notify } = await open(status())
    await user.type(box(), KEY)
    await user.click(screen.getByRole('button', { name: /Save & lock key/ }))
    const dlg = screen.getByRole('heading', { name: 'Set a passcode' }).closest('.modal') as HTMLElement
    await user.type(within(dlg).getByLabelText(/^Passcode/), '4321')
    await user.type(within(dlg).getByLabelText(/again to confirm/), '9999')
    await user.click(within(dlg).getByRole('button', { name: /Set passcode/ }))
    expect(await within(dlg).findByRole('alert')).toHaveTextContent(/do not match/)
    expect(adminApi.saveGemini).not.toHaveBeenCalled()

    await user.clear(within(dlg).getByLabelText(/again to confirm/))
    await user.type(within(dlg).getByLabelText(/again to confirm/), '4321')
    vi.mocked(adminApi.saveGemini).mockResolvedValue(saved as never)
    await user.click(within(dlg).getByRole('button', { name: /Set passcode/ }))
    await waitFor(() => expect(adminApi.saveGemini).toHaveBeenCalledWith(KEY, '4321'))
    await waitFor(() => expect(box()).toHaveAttribute('readonly'))
    expect(box().value).toMatch(/^•+$/) // the key is not on the page any more
    expect(screen.getByText(/Active · ends …abcd/)).toBeInTheDocument()
    expect(notify).toHaveBeenCalled()
  })

  it('a saved key shows dots only; a wrong passcode keeps it locked, the right one opens it for editing and copying', async () => {
    const user = userEvent.setup()
    await open(saved)
    expect(box().value).toMatch(/^•+$/)
    expect(box()).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: 'Copy the key' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Locked\. Unlock/ }))
    const dlg = screen.getByRole('heading', { name: 'Enter the passcode' }).closest('.modal') as HTMLElement
    vi.mocked(adminApi.unlockGemini).mockRejectedValueOnce(new Error('Incorrect passcode.'))
    await user.type(within(dlg).getByLabelText('Passcode'), 'nope')
    await user.click(within(dlg).getByRole('button', { name: 'Unlock key' }))
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('Incorrect passcode.')
    expect(box()).toHaveAttribute('readonly')

    vi.mocked(adminApi.unlockGemini).mockResolvedValueOnce({ apiKey: KEY })
    await user.clear(within(dlg).getByLabelText('Passcode'))
    await user.type(within(dlg).getByLabelText('Passcode'), '4321')
    await user.click(within(dlg).getByRole('button', { name: 'Unlock key' }))
    await waitFor(() => expect(box()).not.toHaveAttribute('readonly'))
    expect(box().value).toBe(KEY)
    expect(screen.getByRole('button', { name: 'Copy the key' })).toBeInTheDocument()
    expect(box()).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show the key' }))
    expect(box()).toHaveAttribute('type', 'text')
  })

  it('replacing the key reuses the passcode just entered, and locks again; the lock icon also locks', async () => {
    const user = userEvent.setup()
    await open(saved)
    vi.mocked(adminApi.unlockGemini).mockResolvedValue({ apiKey: KEY })
    await user.click(screen.getByRole('button', { name: /Locked\. Unlock/ }))
    await user.type(screen.getByLabelText('Passcode'), '4321')
    await user.click(screen.getByRole('button', { name: 'Unlock key' }))
    await waitFor(() => expect(box()).not.toHaveAttribute('readonly'))

    const NEW = 'AIzaSyReplacementKeyForCareWeave00000zz'
    await user.clear(box())
    await user.type(box(), NEW)
    vi.mocked(adminApi.saveGemini).mockResolvedValue({ ...saved, last4: '00zz' } as never)
    await user.click(screen.getByRole('button', { name: /Save & lock key/ }))
    await waitFor(() => expect(adminApi.saveGemini).toHaveBeenCalledWith(NEW, '4321'))
    await waitFor(() => expect(box()).toHaveAttribute('readonly'))

    await user.click(screen.getByRole('button', { name: /Locked\. Unlock/ }))
    await user.type(screen.getByLabelText('Passcode'), '4321')
    await user.click(screen.getByRole('button', { name: 'Unlock key' }))
    await waitFor(() => expect(box()).not.toHaveAttribute('readonly'))
    await user.click(screen.getByRole('button', { name: /Unlocked\. Lock again/ }))
    expect(box()).toHaveAttribute('readonly')
    expect(box().value).toMatch(/^•+$/)
  })

  it('Test connection reports a pass or the reason, using the typed key when there is one', async () => {
    const user = userEvent.setup()
    await open(status())
    await user.type(box(), KEY)
    vi.mocked(adminApi.testGemini).mockResolvedValueOnce({ ok: false, error: 'Google did not accept this key. Check it in Google AI Studio.' })
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(await screen.findByText(/did not accept this key/)).toBeInTheDocument()
    expect(adminApi.testGemini).toHaveBeenCalledWith(KEY)
    vi.mocked(adminApi.testGemini).mockResolvedValueOnce({ ok: true, model: 'gemini-test', ms: 1200 })
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(await screen.findByText(/Connected · gemini-test · 1\.2 s/)).toBeInTheDocument()
  })

  it('the switches turn the lab scanner and the doctor brief on and off', async () => {
    const user = userEvent.setup()
    await open(saved)
    vi.mocked(adminApi.geminiOptions).mockResolvedValue({ ...saved, features: { scan: true, brief: false } } as never)
    await user.click(screen.getByRole('switch', { name: 'Doctor pre-consult brief' }))
    expect(adminApi.geminiOptions).toHaveBeenCalledWith({ brief: false })
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Doctor pre-consult brief' })).toHaveAttribute('aria-checked', 'false'))
    expect(screen.getByRole('switch', { name: 'Laboratory report scanner' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/Nothing here uses Gemini/)).toBeInTheDocument() // the receptionist portal has no switch
  })

  it('removing the key needs the passcode and then shows the empty state', async () => {
    const user = userEvent.setup()
    await open(saved)
    await user.click(screen.getByRole('button', { name: 'Remove key' }))
    const dlg = screen.getByRole('heading', { name: 'Remove the Gemini key' }).closest('.modal') as HTMLElement
    vi.mocked(adminApi.removeGemini).mockResolvedValue(status() as never)
    await user.type(within(dlg).getByLabelText(/Passcode to confirm/), '4321')
    await user.click(within(dlg).getByRole('button', { name: 'Remove key' }))
    await waitFor(() => expect(adminApi.removeGemini).toHaveBeenCalledWith('4321'))
    expect(await screen.findByText('Not configured')).toBeInTheDocument()
    expect(box()).not.toHaveAttribute('readonly')
  })

  it('a key set only on the server is shown as in use, with a note that saving here replaces it', async () => {
    await open(status({ configured: true, source: 'env' }))
    expect(screen.getByText(/Active · set on the server/)).toBeInTheDocument()
    expect(screen.getByText(/GEMINI_API_KEY/)).toBeInTheDocument()
    expect(box()).not.toHaveAttribute('readonly')
    expect(box().value).toBe('')
  })
})
