import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('./api', () => ({
  adminApi: { catalog: vi.fn(), staff: vi.fn(), updateStaff: vi.fn(), deleteStaff: vi.fn(), resetLink: vi.fn(), createStaff: vi.fn() },
}))

import { StaffAccess } from './StaffAccess'
import { adminApi } from './api'

const person = (over: object) => ({
  id: 'u-x', name: 'Someone', email: 'x@x.test', role: 'receptionist', facility: '', permissions: [], active: true, localLogin: false,
  firebaseLinked: true, version: 1, room: '', shiftStart: '08:30', shiftEnd: '16:30', ...over,
})
const me = person({ id: 'u-me', name: 'Ravi Admin', email: 'admin@x.test', role: 'admin' })
const maya = person({ id: 'u-1', name: 'Maya Active', email: 'maya@x.test' })
const old1 = person({ id: 'u-2', name: 'Old Demo One', email: 'one@careweave.test', active: false })
const old2 = person({ id: 'u-3', name: 'Old Demo Two', email: 'two@careweave.test', active: false })

const open = async (staff: object[]) => {
  vi.mocked(adminApi.catalog).mockResolvedValue({ roles: ['receptionist'], permissions: {}, defaults: {}, firebase: true } as never)
  vi.mocked(adminApi.staff).mockResolvedValue(staff as never)
  const notify = vi.fn()
  render(<StaffAccess selfId="u-me" notify={notify} />)
  await screen.findByText(staff.length ? (staff[0] as { name: string }).name : 'No staff yet.')
  return { notify }
}
const rowFor = (name: string) => screen.getByText(name).closest('tr') as HTMLElement

beforeEach(() => { Object.values(adminApi).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset()); vi.unstubAllGlobals() })

describe('Staff list views', () => {
  it('shows only active accounts, with a button that counts the disabled ones', async () => {
    await open([me, maya, old1, old2])
    expect(screen.getByText('Maya Active')).toBeInTheDocument()
    expect(screen.queryByText('Old Demo One')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show disabled accounts (2)' })).toBeInTheDocument()
    expect(within(rowFor('Maya Active')).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument() // an active account cannot be deleted
  })

  it('"Show disabled" shows ONLY the disabled accounts, with Enable and Delete, and a way back', async () => {
    const user = userEvent.setup()
    await open([me, maya, old1, old2])
    await user.click(screen.getByRole('button', { name: 'Show disabled accounts (2)' }))
    expect(screen.getByText('Old Demo One')).toBeInTheDocument()
    expect(screen.getByText('Old Demo Two')).toBeInTheDocument()
    expect(screen.queryByText('Maya Active')).not.toBeInTheDocument()
    expect(within(rowFor('Old Demo One')).getByRole('button', { name: 'Enable' })).toBeInTheDocument()
    expect(within(rowFor('Old Demo One')).getByRole('button', { name: 'Delete' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '← Back to active accounts' }))
    expect(screen.getByText('Maya Active')).toBeInTheDocument()
    expect(screen.queryByText('Old Demo One')).not.toBeInTheDocument()
  })

  it('has no disabled button when nothing is disabled', async () => {
    await open([me, maya])
    expect(screen.queryByRole('button', { name: /disabled accounts/ })).not.toBeInTheDocument()
  })
})

describe('Delete', () => {
  it('asks first; saying no deletes nothing', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('confirm', vi.fn(() => false))
    await open([me, maya, old1])
    await user.click(screen.getByRole('button', { name: 'Show disabled accounts (1)' }))
    await user.click(within(rowFor('Old Demo One')).getByRole('button', { name: 'Delete' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('one@careweave.test'))
    expect(adminApi.deleteStaff).not.toHaveBeenCalled()
  })

  it('deletes once confirmed, and returns to the active list after the last disabled account is gone', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.mocked(adminApi.deleteStaff).mockResolvedValue({ ok: true, firebase: 'removed' })
    const { notify } = await open([me, maya, old1])
    await user.click(screen.getByRole('button', { name: 'Show disabled accounts (1)' }))

    vi.mocked(adminApi.staff).mockResolvedValue([me, maya] as never) // the list after the delete
    await user.click(within(rowFor('Old Demo One')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(adminApi.deleteStaff).toHaveBeenCalledWith('u-2'))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Old Demo One deleted'))
    expect(await screen.findByText('Maya Active')).toBeInTheDocument() // back on the people who work here
  })

  it('shows the server\'s reason when a delete is refused', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.mocked(adminApi.deleteStaff).mockRejectedValue(new Error('Disable the account first, then delete it'))
    const { notify } = await open([me, old1, old2])
    await user.click(screen.getByRole('button', { name: /Show disabled accounts/ }))
    await user.click(within(rowFor('Old Demo Two')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Disable the account first, then delete it'))
  })
})
