import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../services/aiScanner', () => ({ parseMedicalDocumentWithAI: vi.fn() }))
vi.mock('../api', () => ({ createLabOrder: vi.fn(), updateOrderStatus: vi.fn() }))

import AIScannerModal from './AIScannerModal'
import { parseMedicalDocumentWithAI } from '../services/aiScanner'
import { createLabOrder, updateOrderStatus } from '../api'

const scanned = (over: object = {}) => ({
  patientName: 'Ravi Kumar', patientUhid: 'UH-1', visitNo: 'V-1', labNo: '', patientAge: 45, patientGender: 'M', opIp: 'OP',
  referralDoctor: 'Dr. Mehta', orderingDoctor: '', testName: 'Lipid Profile', department: '', priority: 'routine', impression: '',
  warnings: ['1 row needs a careful check against the original.'],
  results: [
    { parameter: 'LDL', value: '165', unit: 'mg/dL', referenceRange: '< 100', flag: 'abnormal' },
    { parameter: 'Triglycerides', value: '190', unit: 'mg/dL', referenceRange: '< 150', flag: 'normal', needsCheck: true, checkReason: 'Marked normal, but the value is outside the printed range' },
  ],
  ...over,
})

async function scanAReport(data = scanned()) {
  vi.mocked(parseMedicalDocumentWithAI).mockResolvedValue(data as never)
  const onSuccess = vi.fn()
  const { container } = render(<AIScannerModal onClose={() => {}} onImportSuccess={onSuccess} />)
  await userEvent.upload(container.querySelector('input[type=file]')!, new File(['x'], 'r.png', { type: 'image/png' }))
  await screen.findByText(/Extracted \(/)
  return onSuccess
}

beforeEach(() => vi.clearAllMocks())

describe('AIScannerModal', () => {
  it('shows scanner warnings and marks the rows that need a check', async () => {
    await scanAReport()
    expect(screen.getByRole('alert')).toHaveTextContent('1 row needs a careful check')
    expect(screen.getByText(/Check: Marked normal, but the value is outside/)).toBeInTheDocument()
  })

  it('shows the scan error and returns to upload when the scan fails', async () => {
    vi.mocked(parseMedicalDocumentWithAI).mockRejectedValue(new Error('The scanner is busy'))
    const { container } = render(<AIScannerModal onClose={() => {}} onImportSuccess={() => {}} />)
    await userEvent.upload(container.querySelector('input[type=file]')!, new File(['x'], 'r.png', { type: 'image/png' }))
    expect(await screen.findByText(/The scanner is busy/)).toBeInTheDocument()
  })

  it('lets the reviewer correct a value and clears that row’s warning', async () => {
    await scanAReport()
    const value = screen.getAllByLabelText('Result')[1]
    await userEvent.clear(value)
    await userEvent.type(value, '140')
    expect(value).toHaveValue('140')
    expect(screen.queryByText(/Check: Marked normal/)).not.toBeInTheDocument()
  })

  it('refuses to send without a patient name and does not touch the server', async () => {
    await scanAReport(scanned({ patientName: '' }))
    await userEvent.click(screen.getByRole('button', { name: /send to verification queue/i }))
    expect(await screen.findByText(/Enter the patient name/)).toBeInTheDocument()
    expect(createLabOrder).not.toHaveBeenCalled()
  })

  it('refuses to send when every row was removed', async () => {
    await scanAReport()
    // Rows are keyed by position, so always click the first remaining button.
    while (screen.queryAllByRole('button', { name: /^Remove/ }).length) await userEvent.click(screen.getAllByRole('button', { name: /^Remove/ })[0])
    await userEvent.click(screen.getByRole('button', { name: /send to verification queue/i }))
    expect(await screen.findByText(/no results to send/i)).toBeInTheDocument()
    expect(createLabOrder).not.toHaveBeenCalled()
  })

  it('sends a draft to the verification queue, never straight to released, without the helper fields', async () => {
    const onSuccess = await scanAReport()
    vi.mocked(createLabOrder).mockResolvedValue({ id: 'ORD-1' } as never)
    vi.mocked(updateOrderStatus).mockResolvedValue({ id: 'ORD-1', status: 'awaiting_verification' } as never)
    await userEvent.click(screen.getByRole('button', { name: /send to verification queue/i }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    const calls = vi.mocked(updateOrderStatus).mock.calls
    expect(calls.map((c) => c[1])).toEqual(['collected', 'awaiting_verification'])
    const sent = (calls[1][2]?.results ?? []) as unknown as Record<string, unknown>[]
    expect(sent).toHaveLength(2)
    expect(sent.every((r) => !('needsCheck' in r) && !('checkReason' in r))).toBe(true)
  })

  it('shows an error and stays open when the server rejects the send', async () => {
    const onSuccess = await scanAReport()
    vi.mocked(createLabOrder).mockRejectedValue(new Error('Order could not be created'))
    await userEvent.click(screen.getByRole('button', { name: /send to verification queue/i }))
    expect(await screen.findByText('Order could not be created')).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /send to verification queue/i })).toBeEnabled()
  })
})
