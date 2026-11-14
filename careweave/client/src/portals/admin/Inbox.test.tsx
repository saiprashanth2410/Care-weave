import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('./api', () => ({
  adminApi: { inbox: vi.fn(), updateInbox: vi.fn(), resetLink: vi.fn() },
}))

import { Inbox } from './Inbox'
import { adminApi } from './api'

const base = {
  fromRole: 'receptionist', knownStaff: true, staffId: 'u-1', staffActive: true, message: 'I forgot my password', count: 1,
  createdAt: new Date().toISOString(), lastAt: new Date().toISOString(),
}
const help = { ...base, id: 'm1', kind: 'help', fromEmail: 'maya@x.test', fromName: 'Maya Patel', subject: 'Needs help signing in', status: 'new' }
const issue = { ...base, id: 'm2', kind: 'issue', fromEmail: 'doc@x.test', fromName: 'Dr. Laha', fromRole: 'doctor', staffId: 'u-2', subject: 'Lab list empty', message: 'Nothing shows', page: '/doctor', status: 'read' }

const show = (items: object[], props: Partial<Parameters<typeof Inbox>[0]> = {}) => {
  vi.mocked(adminApi.inbox).mockResolvedValue({ items, counts: { new: items.filter((i: any) => i.status === 'new').length, read: 1, resolved: 0 } } as never)
  vi.mocked(adminApi.updateInbox).mockImplementation(async (id, body) => ({ ...(items.find((i: any) => i.id === id) as object), ...body }) as never)
  const notify = vi.fn()
  const onChanged = vi.fn()
  render(<Inbox notify={notify} refresh={0} canSendLinks onChanged={onChanged} {...props} />)
  return { notify, onChanged }
}

beforeEach(() => { vi.mocked(adminApi.inbox).mockReset(); vi.mocked(adminApi.updateInbox).mockReset(); vi.mocked(adminApi.resetLink).mockReset() })

describe('Inbox', () => {
  it('lists messages like a mail client, unread ones marked, and shows an empty state', async () => {
    show([help, issue])
    const list = await screen.findByRole('list', { name: 'Messages' })
    expect(within(list).getByText('Maya Patel')).toBeInTheDocument()
    expect(within(list).getByLabelText('Unread')).toBeInTheDocument() // only the new one
    expect(within(list).getAllByLabelText('Unread')).toHaveLength(1)
    expect(screen.getByText('Choose a message on the left to read it.')).toBeInTheDocument()
  })

  it('says so when there is nothing', async () => {
    show([])
    expect(await screen.findByText(/No messages/)).toBeInTheDocument()
  })

  it('opening a message shows it in the side pane and marks it read', async () => {
    const user = userEvent.setup()
    const { onChanged } = show([help])
    await user.click(await screen.findByRole('listitem'))
    const pane = await screen.findByRole('article', { name: 'Message' })
    expect(within(pane).getByText('I forgot my password')).toBeInTheDocument()
    expect(within(pane).getByText(/maya@x\.test/)).toBeInTheDocument()
    expect(within(pane).getByText('This address belongs to a staff account.')).toBeInTheDocument()
    await waitFor(() => expect(adminApi.updateInbox).toHaveBeenCalledWith('m1', { status: 'read' }))
    expect(onChanged).toHaveBeenCalled() // the unread badge refreshes
  })

  it('does not mark an already-read message again', async () => {
    const user = userEvent.setup()
    show([issue])
    await user.click(await screen.findByRole('listitem'))
    expect(await screen.findByText('Reported from /doctor')).toBeInTheDocument()
    expect(adminApi.updateInbox).not.toHaveBeenCalled()
  })

  it('a sign-in request offers "Send reset link", which opens the link to copy; a problem report does not', async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.resetLink).mockResolvedValue({ link: 'https://app.test/reset-password?oobCode=Z' })
    show([help, issue])
    const items = await screen.findAllByRole('listitem')
    await user.click(items[1]) // the problem report
    expect(screen.queryByRole('button', { name: 'Send reset link' })).not.toBeInTheDocument()

    await user.click(items[0]) // the sign-in request
    await user.click(await screen.findByRole('button', { name: 'Send reset link' }))
    expect(adminApi.resetLink).toHaveBeenCalledWith('u-1')
    expect(await screen.findByDisplayValue('https://app.test/reset-password?oobCode=Z')).toBeInTheDocument()
  })

  it('hides "Send reset link" for an unknown address, a disabled account, or when links are not set up', async () => {
    const user = userEvent.setup()
    show([{ ...help, knownStaff: false, staffId: '' }])
    await user.click(await screen.findByRole('listitem'))
    expect(await screen.findByText(/not a staff account/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send reset link' })).not.toBeInTheDocument()
  })

  it('without Firebase account management there is no reset button either', async () => {
    const user = userEvent.setup()
    show([help], { canSendLinks: false })
    await user.click(await screen.findByRole('listitem'))
    await screen.findByRole('article', { name: 'Message' })
    expect(screen.queryByRole('button', { name: 'Send reset link' })).not.toBeInTheDocument()
  })

  it('marks a message resolved with the note, and a resolved one can be reopened', async () => {
    const user = userEvent.setup()
    show([issue])
    await user.click(await screen.findByRole('listitem'))
    await user.type(await screen.findByLabelText(/Note for the record/), 'Cleared their cache')
    await user.click(screen.getByRole('button', { name: 'Mark resolved' }))
    expect(adminApi.updateInbox).toHaveBeenCalledWith('m2', { status: 'resolved', note: 'Cleared their cache' })
  })

  it('a resolved message shows who resolved it and can be reopened', async () => {
    const user = userEvent.setup()
    show([{ ...issue, status: 'resolved', resolvedBy: 'Ravi Menon', resolvedAt: new Date().toISOString() }])
    await user.click(await screen.findByRole('listitem'))
    expect(await screen.findByText(/Resolved by Ravi Menon/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark resolved' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(adminApi.updateInbox).toHaveBeenCalledWith('m2', { status: 'new' })
  })
})
