import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('./firebase', () => ({ firebaseVerifyResetCode: vi.fn(), firebaseConfirmReset: vi.fn() }))

import ResetPassword from './ResetPassword'
import { passwordProblem } from './passwordRules'
import { firebaseConfirmReset, firebaseVerifyResetCode } from './firebase'

const open = (search = '?mode=resetPassword&oobCode=ABC123') =>
  render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <ResetPassword />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.mocked(firebaseVerifyResetCode).mockReset().mockResolvedValue('doctor@careweave.com')
  vi.mocked(firebaseConfirmReset).mockReset().mockResolvedValue(undefined)
})

describe('password rules', () => {
  it('asks for at least 8 characters and a matching confirmation', () => {
    expect(passwordProblem('short', 'short')).toMatch(/at least 8/)
    expect(passwordProblem('longenough', 'different1')).toMatch(/do not match/)
    expect(passwordProblem('longenough', 'longenough')).toBe('')
  })
})

describe('ResetPassword page', () => {
  it('names the account the link is for', async () => {
    open()
    expect(await screen.findByText('doctor@careweave.com')).toBeInTheDocument()
    expect(firebaseVerifyResetCode).toHaveBeenCalledWith('ABC123')
  })

  it('the show/hide button reveals and hides each password field on its own', async () => {
    const user = userEvent.setup()
    open()
    const first = await screen.findByLabelText('New password')
    const second = screen.getByLabelText('Confirm new password')
    expect(first).toHaveAttribute('type', 'password')
    expect(second).toHaveAttribute('type', 'password')

    const [showFirst, showSecond] = screen.getAllByRole('button', { name: 'Show password' })
    await user.click(showFirst)
    expect(first).toHaveAttribute('type', 'text')
    expect(second).toHaveAttribute('type', 'password') // the other field stays hidden

    await user.click(showSecond)
    expect(second).toHaveAttribute('type', 'text')

    await user.click(screen.getAllByRole('button', { name: 'Hide password' })[0])
    expect(first).toHaveAttribute('type', 'password')
  })

  it('keeps what was typed when the password is shown or hidden', async () => {
    const user = userEvent.setup()
    open()
    const first = await screen.findByLabelText('New password')
    await user.type(first, 'SecretPass9')
    await user.click(screen.getAllByRole('button', { name: 'Show password' })[0])
    expect(first).toHaveValue('SecretPass9')
  })

  it('refuses a short password and a mismatch without calling Firebase', async () => {
    const user = userEvent.setup()
    open()
    await user.type(await screen.findByLabelText('New password'), 'short')
    await user.type(screen.getByLabelText('Confirm new password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Save password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8/)

    await user.clear(screen.getByLabelText('New password'))
    await user.clear(screen.getByLabelText('Confirm new password'))
    await user.type(screen.getByLabelText('New password'), 'GoodPassword1')
    await user.type(screen.getByLabelText('Confirm new password'), 'GoodPassword2')
    await user.click(screen.getByRole('button', { name: 'Save password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/)
    expect(firebaseConfirmReset).not.toHaveBeenCalled()
  })

  it('saves a good password with the link code and then points to sign-in', async () => {
    const user = userEvent.setup()
    open()
    await user.type(await screen.findByLabelText('New password'), 'GoodPassword1')
    await user.type(screen.getByLabelText('Confirm new password'), 'GoodPassword1')
    await user.click(screen.getByRole('button', { name: 'Save password' }))
    await waitFor(() => expect(firebaseConfirmReset).toHaveBeenCalledWith('ABC123', 'GoodPassword1'))
    expect(await screen.findByText('Your password has been changed.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login')
  })

  it('shows Firebase\'s reason when the link is expired or already used, and offers no form', async () => {
    vi.mocked(firebaseVerifyResetCode).mockRejectedValue(new Error('This link has expired. Ask an administrator for a new one.'))
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/)
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toBeInTheDocument()
  })

  it('says so when the link has no code at all', async () => {
    open('')
    expect(await screen.findByRole('alert')).toHaveTextContent(/not complete/)
    expect(firebaseVerifyResetCode).not.toHaveBeenCalled()
  })

  it('shows the error from saving (for example a link used a second time)', async () => {
    vi.mocked(firebaseConfirmReset).mockRejectedValue(new Error('This link is not valid or was already used. Ask an administrator for a new one.'))
    const user = userEvent.setup()
    open()
    await user.type(await screen.findByLabelText('New password'), 'GoodPassword1')
    await user.type(screen.getByLabelText('Confirm new password'), 'GoodPassword1')
    await user.click(screen.getByRole('button', { name: 'Save password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/already used/)
    expect(screen.queryByText('Your password has been changed.')).not.toBeInTheDocument()
  })
})
