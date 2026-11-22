import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../api', () => ({
  createLabOrder: vi.fn(),
  getDoctors: vi.fn(async () => [{ name: 'Dr. Laha' }]),
  searchRegisteredPatients: vi.fn(async () => []),
  TEST_TEMPLATES: { 'Complete Blood Count (CBC)': { department: 'Hematology' } },
  testsByCategory: () => [['Hematology', ['Complete Blood Count (CBC)']]],
}))

import NewRequisitionModal from './NewRequisitionModal'

beforeEach(() => vi.clearAllMocks())

describe('New requisition form', () => {
  it('opens with its heading and closes without creating anything', async () => {
    const onClose = vi.fn(), onCreated = vi.fn()
    render(<NewRequisitionModal onClose={onClose} onCreated={onCreated} />)
    expect(screen.getByText('New Laboratory Requisition')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onCreated).not.toHaveBeenCalled()
  })
})
