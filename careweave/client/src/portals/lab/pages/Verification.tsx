import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getLabOrders, requestOrderRecollection, updateOrderStatus, verifyAndReleaseOrder } from '../api'
import DiagnosticReportView from '../components/DiagnosticReportView'
import type { LabOrder } from '../types'
import { useLabUser } from '../useLabUser'

export default function Verification() {
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(null)
  const { user, canVerify } = useLabUser()
  const verifierName = user.name
  const [pathNotes, setPathNotes] = useState('')
  const [searchParams] = useSearchParams()

  const openReview = (order: LabOrder) => {
    setSelectedOrder(order)
    setPathNotes(order.pathologistNotes || '')
  }

  useEffect(() => {
    getLabOrders()
      .then((data) => {
        setOrders(data)
        const orderIdParam = searchParams.get('order')
        if (orderIdParam) {
          const match = data.find((o) => o.id === orderIdParam)
          if (match) openReview(match)
        }
      })
      .catch(() => {}) // the layout banner reports the failure
      .finally(() => setLoading(false))
  }, [searchParams])

  const handleAuthorize = async () => {
    if (!selectedOrder) return
    const updated = await verifyAndReleaseOrder(selectedOrder.id, {
      verifiedBy: verifierName,
      notes: pathNotes,
    })
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    setSelectedOrder(updated)
  }

  const handleRequestRerun = async () => {
    if (!selectedOrder) return
    const note = window.prompt('Specify instruction for analyzer repeat run:', 'Repeat test on fresh calibrator run')
    if (!note) return
    const updated = await updateOrderStatus(selectedOrder.id, 'processing', {
      technicianNotes: `Rerun requested by ${verifierName}: ${note}`,
    })
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    setSelectedOrder(null)
  }

  const handleRejectSpecimen = async () => {
    if (!selectedOrder) return
    const reason = window.prompt('Reason for specimen rejection at verification:', 'Results physiologically implausible; recollect specimen.')
    if (!reason) return
    const updated = await requestOrderRecollection(selectedOrder.id, reason)
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    setSelectedOrder(null)
  }

  const awaiting = useMemo(() => orders.filter((o) => o.status === 'awaiting_verification'), [orders])
  const completed = useMemo(() => orders.filter((o) => ['verified', 'released'].includes(o.status)), [orders])

  const counts = {
    awaiting: awaiting.length,
    urgent: awaiting.filter((o) => o.priority === 'urgent').length,
    completed: completed.length,
  }

  return (
    <div className="min-w-0 space-y-6">
      {/* Header */}
      <div className="border-b border-ink pb-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Verification queue</h1>
        <p className="mt-1 text-sm text-ink-2">Clinical supervisor and pathologist report sign-off before electronic release.</p>
      </div>

      {/* Metrics Row */}
      <section aria-label="Verification counts" className="grid grid-cols-1 gap-px border border-rule bg-rule sm:grid-cols-3">
        <div className="bg-surface p-4">
          <p className="text-3xl font-semibold tabular-nums text-accent-ink">{counts.awaiting}</p>
          <p className="mt-1 text-xs text-ink-2">Reports awaiting clinical verification</p>
        </div>
        <div className="bg-surface p-4">
          <p className={`text-3xl font-semibold tabular-nums ${counts.urgent > 0 ? 'text-alert' : 'text-ink'}`}>
            {counts.urgent}
          </p>
          <p className="mt-1 text-xs text-ink-2">STAT / Urgent reports requiring immediate review</p>
        </div>
        <div className="bg-surface p-4">
          <p className="text-3xl font-semibold tabular-nums text-ink">{counts.completed}</p>
          <p className="mt-1 text-xs text-ink-2">Reports signed & released</p>
        </div>
      </section>

      {/* Awaiting Review Table */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink">Pending Verification ({awaiting.length})</h2>
          <p className="text-xs text-ink-3">Click any report to inspect parameters, delta checks, and sign off</p>
        </div>

        {loading ? (
          <div className="h-48 animate-pulse bg-rule/50" aria-busy="true" />
        ) : awaiting.length === 0 ? (
          <div className="border border-rule bg-surface p-12 text-center text-sm text-ink-3">
            Verification queue is clear. No test reports pending sign-off.
          </div>
        ) : (
          <div className="overflow-x-auto border border-rule bg-surface">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-rule bg-paper/60 text-[11px] uppercase tracking-wide text-ink-3">
                  <th className="py-2.5 pl-4 pr-3 font-semibold">Order</th>
                  <th className="py-2.5 pr-4 font-semibold">Test & Dept</th>
                  <th className="py-2.5 pr-4 font-semibold">Patient</th>
                  <th className="py-2.5 pr-4 font-semibold">Technologist</th>
                  <th className="py-2.5 pr-4 font-semibold">Findings Overview</th>
                  <th className="py-2.5 pr-4 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {awaiting.map((order) => {
                  const abnormalCount = order.results?.filter((r) => r.flag === 'abnormal' || r.flag === 'critical').length || 0
                  const hasCritical = order.results?.some((r) => r.flag === 'critical')
                  return (
                    <tr key={order.id} className="hover:bg-paper/50">
                      <td className="py-3 pl-4 pr-3 font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-ink">{order.id}</span>
                          {order.priority === 'urgent' && (
                            <span className="border border-alert px-1 text-[10px] font-bold uppercase text-alert">STAT</span>
                          )}
                        </div>
                        <p className="text-ink-3">{order.sampleBarcode}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-ink">{order.testName}</p>
                        <p className="text-xs text-ink-3">{order.department}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-ink">{order.patientName}</p>
                        <p className="font-mono text-xs text-ink-3">
                          ID: {order.patientId} · {order.patientAge}y · {order.patientGender}
                        </p>
                      </td>
                      <td className="py-3 pr-4 text-xs text-ink-2">
                        {order.processedBy || 'Bench Technologist'}
                      </td>
                      <td className="py-3 pr-4">
                        {hasCritical ? (
                          <span className="border border-alert bg-alert/15 px-2 py-0.5 text-[11px] font-bold uppercase text-alert">
                            Panic / Critical values
                          </span>
                        ) : abnormalCount > 0 ? (
                          <span className="border border-warn bg-warn/15 px-2 py-0.5 text-[11px] font-bold uppercase text-warn">
                            {abnormalCount} abnormal parameter{abnormalCount > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-3">All within reference</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <button
                          onClick={() => openReview(order)}
                          className="min-h-11 rounded-sm bg-accent px-4 text-xs font-semibold text-surface hover:bg-accent-ink"
                        >
                          Review & Sign
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recently Signed & Released Reports Section */}
      <div className="pt-6 border-t border-rule">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink mb-2">
          Authorized & Released Reports ({completed.length})
        </h2>
        <div className="overflow-x-auto border border-rule bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper/60 text-[11px] uppercase tracking-wide text-ink-3">
                <th className="py-2 pl-4 pr-3 font-semibold">Order</th>
                <th className="py-2 pr-4 font-semibold">Test Name</th>
                <th className="py-2 pr-4 font-semibold">Patient</th>
                <th className="py-2 pr-4 font-semibold">Authorized By</th>
                <th className="py-2 pr-4 font-semibold">Release Timestamp</th>
                <th className="py-2 pr-4 text-right font-semibold">Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {completed.map((order) => (
                <tr key={order.id} className="hover:bg-paper/40">
                  <td className="py-2.5 pl-4 pr-3 font-mono text-xs text-ink">{order.id}</td>
                  <td className="py-2.5 pr-4 font-medium text-ink">{order.testName}</td>
                  <td className="py-2.5 pr-4 text-ink-2">{order.patientName}</td>
                  <td className="py-2.5 pr-4 text-xs text-ink-2">{order.verifiedBy}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-ink-3">
                    {order.verifiedAt ? new Date(order.verifiedAt).toLocaleString() : 'Recent'}
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    <button
                      onClick={() => openReview(order)}
                      className="text-xs font-semibold text-accent-ink underline"
                    >
                      View Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pathologist Clinical Report & Verification Modal  */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-deep/80 p-2 sm:p-6 print:p-0">
          {selectedOrder.status === 'awaiting_verification' && (
            <div className="mx-auto mb-4 max-w-[850px] border-2 border-accent bg-surface p-4 print:hidden">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-3">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-ink">
                    Clinical Authorization Actions
                  </h3>
                  <p className="text-xs text-ink-3">
                    Review the report preview below. Signing releases it to the doctor.
                  </p>
                  {!canVerify && (
                    <p role="status" className="mt-2 border border-warn px-2 py-1 text-xs font-semibold text-warn">
                      Your account cannot verify results. Sign in with a verifier account to release this report.
                    </p>
                  )}
                  {canVerify && selectedOrder.processedBy === user.name && (
                    <p role="status" className="mt-2 border border-warn px-2 py-1 text-xs font-semibold text-warn">
                      You entered these results, so a different verifier must release them.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!canVerify}
                    onClick={handleRequestRerun}
                    className="min-h-10 border border-warn px-3 text-xs font-semibold text-warn hover:bg-warn/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Request Repeat Run
                  </button>
                  <button
                    type="button"
                    disabled={!canVerify}
                    onClick={handleRejectSpecimen}
                    className="min-h-10 border border-alert px-3 text-xs font-semibold text-alert hover:bg-alert/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Reject & Recollect
                  </button>
                  <button
                    type="button"
                    disabled={!canVerify}
                    onClick={handleAuthorize}
                    className="min-h-10 bg-accent px-5 text-xs font-semibold text-surface hover:bg-accent-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Authorize & Digitally Sign
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                    Pathologist Signee
                  </label>
                  <input
                    type="text"
                    value={verifierName}
                    readOnly
                    className="w-full border border-rule bg-paper px-2.5 py-1.5 font-medium text-ink"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                    Interpretive Diagnostic Comments (Optional)
                  </label>
                  <input
                    type="text"
                    value={pathNotes}
                    onChange={(e) => setPathNotes(e.target.value)}
                    placeholder="e.g. Kindly correlate clinically and with other investigations."
                    className="w-full border border-rule bg-paper px-2.5 py-1.5 text-ink"
                  />
                </div>
              </div>
            </div>
          )}

          <DiagnosticReportView
            order={{
              ...selectedOrder,
              pathologistNotes: pathNotes || selectedOrder.pathologistNotes,
              verifiedBy: verifierName || selectedOrder.verifiedBy,
            }}
            onClose={() => setSelectedOrder(null)}
          />
        </div>
      )}
    </div>
  )
}
