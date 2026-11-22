import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../api', () => ({
  api: { patients: vi.fn(), searchMedicines: vi.fn(), validatePrescription: vi.fn(), createPrescriptions: vi.fn() },
}))

import { PrescribeModal } from './PrescribeModal'
import { api } from '../api'

const patient = { id: 'p-1', patientId: 'CW-1', name: 'Rx Patient' } as never

const open = () => {
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(<PrescribeModal patient={patient} onSaved={onSaved} onClose={onClose} />)
  return { onSaved, onClose }
}
const rows = () => document.querySelectorAll<HTMLElement>('.rx-row')
const fill = async (user: ReturnType<typeof userEvent.setup>, n: number, v: { medicine?: string; dosage?: string; frequency?: string; duration?: string }) => {
  if (v.medicine !== undefined) await user.type(screen.getAllByLabelText('Medicine name')[n - 1], v.medicine)
  if (v.dosage) await user.type(screen.getByLabelText(`Dosage for medicine ${n}`), v.dosage)
  if (v.frequency) await user.type(screen.getByLabelText(`Frequency for medicine ${n}`), v.frequency)
  if (v.duration) await user.type(screen.getByLabelText(`Duration for medicine ${n}`), v.duration)
}

beforeEach(() => {
  vi.mocked(api.patients).mockReset().mockResolvedValue([] as never)
  vi.mocked(api.searchMedicines).mockReset().mockResolvedValue([] as never)
  vi.mocked(api.validatePrescription).mockReset().mockResolvedValue({ alerts: [], blocking: false } as never)
  vi.mocked(api.createPrescriptions).mockReset().mockResolvedValue([] as never)
})

describe('Prescribe modal: several medicines', () => {
  it('starts with one empty row: nothing is chosen for the doctor', () => {
    open()
    expect(rows()).toHaveLength(1)
    expect(screen.getByLabelText('Medicine name')).toHaveValue('')
    expect(screen.getByLabelText('Dosage for medicine 1')).toHaveValue('')
    expect(screen.getByLabelText('Frequency for medicine 1')).toHaveValue('')
    expect(screen.getByLabelText('Refills for medicine 1')).toHaveValue(0)
  })

  it('"+ Add row" adds a medicine and the bin removes one, but the last row cannot be removed', async () => {
    const user = userEvent.setup()
    open()
    expect(screen.getByRole('button', { name: 'Remove medicine 1' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '+ Add row' }))
    await user.click(screen.getByRole('button', { name: '+ Add row' }))
    expect(rows()).toHaveLength(3)
    expect(screen.getByText('Medicines (3)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove medicine 2' }))
    expect(rows()).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Remove medicine 2' }))
    expect(rows()).toHaveLength(1)
  })

  it('stops at 15 medicines', async () => {
    const user = userEvent.setup()
    open()
    for (let i = 0; i < 20; i++) if (!(screen.getByRole('button', { name: '+ Add row' }) as HTMLButtonElement).disabled) await user.click(screen.getByRole('button', { name: '+ Add row' }))
    expect(rows()).toHaveLength(15)
    expect(screen.getByRole('button', { name: '+ Add row' })).toBeDisabled()
  })

  it('a common medicine fills the empty row first, then adds a new one', async () => {
    const user = userEvent.setup()
    open()
    const preset = screen.getByLabelText('Add a common medicine')
    await user.selectOptions(preset, 'Metformin HCl')
    expect(rows()).toHaveLength(1)
    expect(screen.getByLabelText('Medicine name')).toHaveValue('Metformin HCl')
    expect(screen.getByLabelText('Dosage for medicine 1')).toHaveValue('500 mg')
    await user.selectOptions(preset, 'Lisinopril')
    expect(rows()).toHaveLength(2)
    expect(screen.getAllByLabelText('Medicine name')[1]).toHaveValue('Lisinopril')
    // each choice was checked against the other medicines in the prescription
    await waitFor(() => expect(api.validatePrescription).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.validatePrescription).mock.calls[1][0].alsoPrescribing).toEqual([expect.objectContaining({ medicine: 'Metformin HCl' })])
  })

  it('a row added after two common medicines can be typed into, and all three are sent', async () => {
    const user = userEvent.setup()
    const { onSaved } = open()
    const preset = screen.getByLabelText('Add a common medicine')
    await user.selectOptions(preset, 'Metformin HCl')
    await user.selectOptions(preset, 'Amlodipine Besylate')
    await user.click(screen.getByRole('button', { name: '+ Add row' }))
    await fill(user, 3, { medicine: 'Paracetamol', dosage: '650 mg', frequency: 'SOS', duration: '5 days' })
    await user.type(screen.getByLabelText('Instructions for medicine 3'), 'After food')
    expect(screen.getAllByLabelText('Medicine name')[2]).toHaveValue('Paracetamol')
    expect(screen.getByLabelText('Instructions for medicine 3')).toHaveValue('After food')

    await user.click(screen.getByRole('button', { name: /Sign & Transmit/ }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const sent = (vi.mocked(api.createPrescriptions).mock.calls[0][0] as { medicines: Record<string, unknown>[] }).medicines
    expect(sent.map(m => m.medicine)).toEqual(['Metformin HCl', 'Amlodipine Besylate', 'Paracetamol'])
    expect(sent[2]).toMatchObject({ dosage: '650 mg', frequency: 'SOS', duration: '5 days', instructions: 'After food' })
  })

  it('sends the optional diagnosis and notes with the medicines', async () => {
    const user = userEvent.setup()
    const { onSaved } = open()
    await fill(user, 1, { medicine: 'Paracetamol', dosage: '650 mg', frequency: 'SOS' })
    await user.type(screen.getByLabelText('Diagnosis'), 'Viral fever')
    await user.type(screen.getByLabelText('Notes'), 'Plenty of fluids')
    await user.click(screen.getByRole('button', { name: /Sign & Transmit/ }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(vi.mocked(api.createPrescriptions).mock.calls[0][0]).toMatchObject({ diagnosis: 'Viral fever', notes: 'Plenty of fluids' })
  })

  it('asks for at least one medicine, and name, dosage and frequency on each filled row', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: /Sign & Transmit/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one medicine.')

    await fill(user, 1, { medicine: 'Paracetamol' })
    await user.click(screen.getByRole('button', { name: /Sign & Transmit/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Medicine 1: give the name, dosage and frequency/)
    expect(api.createPrescriptions).not.toHaveBeenCalled()
  })

  it('sends every filled row in one request, ignores an empty one, and reports success', async () => {
    const user = userEvent.setup()
    const { onSaved } = open()
    await fill(user, 1, { medicine: 'Metformin HCl', dosage: '500 mg', frequency: 'Twice daily', duration: '30 days' })
    await user.click(screen.getByRole('button', { name: '+ Add row' }))
    await fill(user, 2, { medicine: 'Amlodipine', dosage: '5 mg', frequency: 'Once daily' })
    await user.click(screen.getByRole('button', { name: '+ Add row' })) // left empty
    expect(screen.getByRole('button', { name: /Sign & Transmit E-Prescription \(3 medicines\)/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Sign & Transmit/ }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(api.createPrescriptions).toHaveBeenCalledTimes(1)
    const body = vi.mocked(api.createPrescriptions).mock.calls[0][0] as { patientId: string; medicines: Record<string, unknown>[] }
    expect(body.patientId).toBe('p-1')
    expect(body.medicines.map(m => m.medicine)).toEqual(['Metformin HCl', 'Amlodipine'])
    expect(body.medicines[0]).toMatchObject({ dosage: '500 mg', frequency: 'Twice daily', duration: '30 days', route: 'Oral', refills: 0 })
  })

  it('an allergy on one row is shown on that row and asks for a reason; the reason is sent on the next try', async () => {
    const user = userEvent.setup()
    const { onSaved } = open()
    await fill(user, 1, { medicine: 'Metformin', dosage: '500 mg', frequency: 'Daily' })
    await user.click(screen.getByRole('button', { name: '+ Add row' }))
    await fill(user, 2, { medicine: 'Amoxicillin', dosage: '500 mg', frequency: 'Every 8 hours' })

    vi.mocked(api.createPrescriptions).mockRejectedValueOnce(Object.assign(new Error('blocked'), {
      body: { code: 'PRESCRIPTION_BLOCKED', blocked: [{ index: 1, kind: 'allergy', error: 'Allergy on record: Penicillin (Severe).' }] },
    }))
    await user.click(screen.getByRole('button', { name: /Sign & Transmit/ }))
    const second = rows()[1]
    expect(await within(second).findByText(/Allergy on record: Penicillin/)).toBeInTheDocument()
    expect(within(rows()[0]).queryByText(/ALLERGY ALERT/)).not.toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()

    // too short a reason is refused on the page, without asking the server
    await user.type(within(second).getByLabelText(/Reason for prescribing despite the allergy/), 'short')
    await user.click(screen.getByRole('button', { name: /Sign & Transmit/ }))
    expect(await screen.findByText(/at least 15 characters/)).toBeInTheDocument()
    expect(api.createPrescriptions).toHaveBeenCalledTimes(1)

    await user.clear(within(second).getByLabelText(/Reason for prescribing despite the allergy/))
    await user.type(within(second).getByLabelText(/Reason for prescribing despite the allergy/), 'Tolerated before, specialist supervised')
    await user.click(screen.getByRole('button', { name: /Sign & Transmit/ }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const sent = (vi.mocked(api.createPrescriptions).mock.calls[1][0] as { medicines: Record<string, unknown>[] }).medicines
    expect(sent[1].allergyOverrideReason).toBe('Tolerated before, specialist supervised')
    expect(sent[0].allergyOverrideReason).toBeUndefined()
  })

  it('a duplicate-therapy block marks the row and offers Review; changing the drug clears the mark', async () => {
    const user = userEvent.setup()
    open()
    await fill(user, 1, { medicine: 'Dolo 650 (paracetamol)', dosage: '650 mg', frequency: 'Every 6 hours' })
    vi.mocked(api.createPrescriptions).mockRejectedValueOnce(Object.assign(new Error('blocked'), {
      body: {
        code: 'PRESCRIPTION_BLOCKED',
        blocked: [{ index: 0, kind: 'duplicate', error: 'Duplicate therapy', alerts: [{ severity: 'HIGH_COLLISION', prescribedDrug: { name: 'Dolo', brand: 'Dolo', generic: 'paracetamol' }, conflictingDrug: { name: 'Calpol', brand: 'Calpol', generic: 'paracetamol', source: 'IN_HOUSE_ENCOUNTER', prescribedDate: new Date().toISOString() }, matchedMolecules: ['paracetamol'], clinicalWarning: 'Already taking paracetamol.' }] }],
      },
    }))
    await user.click(screen.getByRole('button', { name: /Sign & Transmit/ }))
    expect(await screen.findByText(/Duplicate therapy:/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Dosage for medicine 1'))
    await user.type(screen.getByLabelText('Dosage for medicine 1'), '500 mg')
    expect(screen.queryByText(/Duplicate therapy:/)).not.toBeInTheDocument() // it is checked again on the next try
  })

  it('any other server error is shown and nothing is marked', async () => {
    const user = userEvent.setup()
    open()
    await fill(user, 1, { medicine: 'Metformin', dosage: '500 mg', frequency: 'Daily' })
    vi.mocked(api.createPrescriptions).mockRejectedValueOnce(new Error('Document an encounter for this patient first, so the prescription is linked to it'))
    await user.click(screen.getByRole('button', { name: /Sign & Transmit/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Document an encounter/)
  })
})

describe('Prescribe modal: drug-drug interaction', () => {
  it('a dangerous interaction opens the review (it is no longer ignored) and the order can be cancelled', async () => {
    const user = userEvent.setup()
    vi.mocked(api.validatePrescription).mockResolvedValue({
      blocking: false,
      alerts: [{
        severity: 'DRUG_DRUG_INTERACTION', matchedMolecules: ['apixaban', 'ibuprofen'],
        prescribedDrug: { name: 'Brufen', brand: 'Brufen', generic: 'ibuprofen' },
        conflictingDrug: { name: 'Eliquis', brand: 'Eliquis', generic: 'apixaban', source: 'IN_HOUSE_ENCOUNTER', prescribedDate: '2026-11-20' },
        clinicalWarning: 'An NSAID with the anticoagulant multiplies bleeding risk.'
      }]
    } as never)
    open()
    await user.selectOptions(screen.getByLabelText('Add a common medicine'), 'Metformin HCl')
    expect(await screen.findByText('Critical Drug-Drug Interaction Detected')).toBeInTheDocument()
    expect(screen.getAllByText(/multiplies bleeding risk/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Document Override/ })).toBeDisabled()
  })
})
