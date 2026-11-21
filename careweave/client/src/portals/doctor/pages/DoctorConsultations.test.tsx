import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../api', () => ({ api: { patients: vi.fn(), createEncounter: vi.fn() } }))

import { DoctorConsultations } from './DoctorConsultations'
import { api } from '../api'

const patients = [
  { id: 'p1', name: 'Priya Raman', patientId: 'CW-1' },
  { id: 'p2', name: 'Asha Rao', patientId: 'CW-2' }
]

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement
const subjective = () => screen.getByPlaceholderText(/Document patient statements/) as HTMLTextAreaElement

const fillAll = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(field(/Chief Complaint/), 'Cough for 3 days')
  await user.type(field(/Primary Diagnosis/), 'Acute bronchitis')
  await user.type(subjective(), 'Productive cough, no fever')
  await user.type(screen.getByPlaceholderText(/Document physical exam/), 'Chest clear')
  await user.type(screen.getByPlaceholderText(/Clinical impression/), 'Bronchitis')
  await user.type(screen.getByPlaceholderText(/Medications prescribed/), 'Rest and fluids')
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(api.patients).mockReset().mockResolvedValue(patients as never)
  vi.mocked(api.createEncounter).mockReset()
})

describe('SOAP note and a 409 conflict', () => {
  it('keeps everything the doctor typed, says so, and saves on the second try', async () => {
    const user = userEvent.setup()
    const notify = vi.fn()
    vi.mocked(api.createEncounter)
      .mockRejectedValueOnce(Object.assign(new Error('Someone else changed this record'), { status: 409, conflict: true }))
      .mockResolvedValueOnce({ id: 'enc1' } as never)
    render(<DoctorConsultations notify={notify} onOpenPatient={() => {}} />)
    await screen.findByDisplayValue('Priya Raman (CW-1)')
    await fillAll(user)

    await user.click(screen.getByRole('button', { name: /Sign & Complete Encounter/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/nothing was lost/i)
    expect(subjective().value).toBe('Productive cough, no fever')
    expect(field(/Chief Complaint/).value).toBe('Cough for 3 days')
    expect(notify).not.toHaveBeenCalledWith(expect.stringMatching(/reload/i))

    await user.click(screen.getByRole('button', { name: /Sign & Complete Encounter/ }))
    await waitFor(() => expect(api.createEncounter).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(subjective().value).toBe(''))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a reload after a failed save brings the typed note back', async () => {
    const user = userEvent.setup()
    const first = render(<DoctorConsultations notify={vi.fn()} onOpenPatient={() => {}} />)
    await screen.findByDisplayValue('Priya Raman (CW-1)')
    await user.type(subjective(), 'Half written note')
    first.unmount()

    render(<DoctorConsultations notify={vi.fn()} onOpenPatient={() => {}} />)
    await screen.findByDisplayValue('Priya Raman (CW-1)')
    await waitFor(() => expect(subjective().value).toBe('Half written note'))
  })

  it("one patient's draft never appears on another patient's form", async () => {
    const user = userEvent.setup()
    render(<DoctorConsultations notify={vi.fn()} onOpenPatient={() => {}} />)
    await screen.findByDisplayValue('Priya Raman (CW-1)')
    await user.type(subjective(), 'Priya note')
    await user.selectOptions(screen.getByRole('combobox'), 'p2')
    await waitFor(() => expect(subjective().value).toBe(''))
    await user.selectOptions(screen.getByRole('combobox'), 'p1')
    await waitFor(() => expect(subjective().value).toBe('Priya note'))
  })
})
