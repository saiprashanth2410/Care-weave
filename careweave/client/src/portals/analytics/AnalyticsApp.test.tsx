import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AnalyticsApp from './AnalyticsApp'

const data = {
  status: { connected: false, engine: 'Application store' },
  source: { live: false, engine: 'application-store' },
  summary: { totalPatients: 12, totalVisits: 40, avgLabTatMinutes: 95, criticalAlertsCount: 2, topPrescribedMedicine: 'Metformin' },
  visitsTrend: [{ date: '2026-11-20', totalVisits: 5, completed: 3, inClinic: 1, scheduled: 1, cancelled: 0, movingAvg7: 4 }],
  departmentWorkload: [{ department: 'General Medicine', visitCount: 9, avgWaitMinutes: 14, waitSamples: 9, activeDoctors: 2 }],
  labTat: [{ testName: 'CBC', department: 'Hematology', priority: 'routine', totalOrders: 3, completedOrders: 2, pendingOrders: 1, avgTatMinutes: 80, p90TatMinutes: 120, slaTargetMinutes: 240, withinSlaPercent: 100, criticalCount: 0 }],
  labStages: { orderToCollectMinutes: 20, orderToCollectSamples: 3, collectToVerifyMinutes: 60, collectToVerifySamples: 2 },
  pharmacyConsumption: [{ medicineName: 'Metformin 500 mg', genericName: 'metformin', form: 'tablet', totalQuantityPrescribed: 60, prescriptionCount: 3, unknownQuantityCount: 0, avgDailyUnits: 2, projectedDemand30d: 60, observationDays: 30 }],
  safety: { totalPrescriptions: 3, allergyBlocks: 1, allergyOverrides: 0, duplicateTherapyBlocks: 1, duplicateTherapyOverrides: 0, makerCheckerBlocks: 0, criticalLabResults: 1 },
  dataQuality: { visitsWithoutWaitTime: 0, labOrdersPending: 1, prescriptionsWithoutQuantity: 0 },
  queries: [{ id: 'q1', title: 'Visits per day', sql: 'SELECT 1 FROM VISITS', engine: 'application-store', rows: 1, ms: 3 }],
  generatedAt: '2026-11-21T10:00:00Z'
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(data), { status: 200 })))
})
afterEach(() => vi.unstubAllGlobals())

describe('Analytics page', () => {
  it('shows the figures and switches between its four tabs', async () => {
    const user = userEvent.setup()
    render(<AnalyticsApp />)
    expect(await screen.findByText('Metformin', { exact: false })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /lab/i }))
    expect(await screen.findByText('CBC')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /pharmacy/i }))
    expect(await screen.findByText('Metformin 500 mg')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /sql/i }))
    expect(await screen.findByText(/SELECT 1 FROM VISITS/)).toBeInTheDocument()
  })
})
