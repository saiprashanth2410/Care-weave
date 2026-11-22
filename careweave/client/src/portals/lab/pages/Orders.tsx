import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getLabOrders, updateOrderStatus } from '../api'
import AIScannerModal from '../components/AIScannerModal'
import NewRequisitionModal from '../components/NewRequisitionModal'
import DiagnosticReportView from '../components/DiagnosticReportView'
import StatusBadge from '../components/StatusBadge'
import type { LabOrder, LabOrderStatus, Priority } from '../types'

type TabFilter = 'all' | 'incoming' | 'pending_specimen' | 'testing' | 'review' | 'completed' | 'exceptions'

export default function Orders() {
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all')
  const [tab, setTab] = useState<TabFilter>('all')
  const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showScannerModal, setShowScannerModal] = useState(false)
  const [reportOrder, setReportOrder] = useState<LabOrder | null>(null)
  const [searchParams] = useSearchParams()

  useEffect(() => {
    getLabOrders()
      .then((data) => {
        setOrders(data)
        const orderIdParam = searchParams.get('order')
        if (orderIdParam) {
          const match = data.find((o) => o.id === orderIdParam)
          if (match) setSelectedOrder(match)
        }
      })
      .catch(() => {}) // the layout banner reports the failure
      .finally(() => setLoading(false))
  }, [searchParams])

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      // Tab filter
      if (tab === 'incoming' && o.status !== 'requested') return false
      if (tab === 'pending_specimen' && o.status !== 'collection_pending') return false
      if (tab === 'testing' && !['collected', 'processing'].includes(o.status)) return false
      if (tab === 'review' && o.status !== 'awaiting_verification') return false
      if (tab === 'completed' && !['verified', 'released'].includes(o.status)) return false
      if (tab === 'exceptions' && !['recollect_required', 'cancelled'].includes(o.status)) return false

      // Priority filter
      if (priorityFilter !== 'all' && o.priority !== priorityFilter) return false

      // Search query
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        o.id.toLowerCase().includes(q) ||
        (o.patientName && o.patientName.toLowerCase().includes(q)) ||
        o.patientId.toLowerCase().includes(q) ||
        (o.patientUhid && o.patientUhid.toLowerCase().includes(q)) ||
        o.testName.toLowerCase().includes(q) ||
        o.orderingDoctor.toLowerCase().includes(q) ||
        (o.department && o.department.toLowerCase().includes(q))
      )
    })
  }, [orders, tab, priorityFilter, query])

  const handleAdvanceStatus = async (order: LabOrder, nextStatus: LabOrderStatus) => {
    const updated = await updateOrderStatus(order.id, nextStatus)
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    setSelectedOrder(updated)
  }

  const handleCancel = async (order: LabOrder) => {
    const reason = window.prompt('Specify reason for requisition cancellation:', 'Cancelled by physician request')
    if (!reason) return
    const updated = await updateOrderStatus(order.id, 'cancelled', { statusReason: reason })
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    setSelectedOrder(updated)
  }

  const counts = {
    all: orders.length,
    incoming: orders.filter((o) => o.status === 'requested').length,
    pending_specimen: orders.filter((o) => o.status === 'collection_pending').length,
    testing: orders.filter((o) => ['collected', 'processing'].includes(o.status)).length,
    review: orders.filter((o) => o.status === 'awaiting_verification').length,
    completed: orders.filter((o) => ['verified', 'released'].includes(o.status)).length,
    exceptions: orders.filter((o) => ['recollect_required', 'cancelled'].includes(o.status)).length,
  }

  return (
    <div className="min-w-0 space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-ink pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Test orders</h1>
          <p className="mt-1 text-sm text-ink-2">Active and completed test requisitions across departments.</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="font-mono text-xs text-ink-3">
            Showing {filtered.length} of {orders.length} orders
          </p>
          <button
            onClick={() => setShowScannerModal(true)}
            className="flex min-h-11 items-center gap-1.5 rounded-sm border-2 border-accent bg-accent/10 px-3.5 text-xs font-bold uppercase tracking-wider text-accent-ink hover:bg-accent hover:text-surface"
          >
            Scan a report
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="min-h-11 rounded-sm bg-accent px-4 text-xs font-semibold uppercase tracking-wider text-surface hover:bg-accent-ink"
          >
            + New Requisition
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-rule pb-2" role="tablist">
        {(
          [
            ['all', `All (${counts.all})`],
            ['incoming', `Incoming (${counts.incoming})`],
            ['pending_specimen', `Specimen pending (${counts.pending_specimen})`],
            ['testing', `In lab (${counts.testing})`],
            ['review', `Awaiting review (${counts.review})`],
            ['completed', `Completed (${counts.completed})`],
            ['exceptions', `Exceptions (${counts.exceptions})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-11 rounded-sm px-3 text-xs font-semibold uppercase tracking-wider ${
              tab === key
                ? 'bg-deep text-surface'
                : 'text-ink-2 hover:bg-paper hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search & Priority Toolbar */}
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <div>
          <label htmlFor="search-input" className="sr-only">Search orders</label>
          <input
            id="search-input"
            type="search"
            placeholder="Search by order ID, patient name, ID, test or doctor..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full min-h-11 border border-rule bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus-visible:border-accent"
          />
        </div>
        <div>
          <label htmlFor="priority-select" className="sr-only">Filter by priority</label>
          <select
            id="priority-select"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'all' | Priority)}
            className="w-full min-h-11 border border-rule bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="all">Priority: All</option>
            <option value="urgent">Priority: Urgent only</option>
            <option value="routine">Priority: Routine only</option>
          </select>
        </div>
      </div>

      {/* Main Orders Table */}
      {loading ? (
        <div className="h-64 animate-pulse bg-rule/50" aria-busy="true" />
      ) : filtered.length === 0 ? (
        <div className="border border-rule bg-surface p-12 text-center text-sm text-ink-3">
          No test orders matching your criteria.
        </div>
      ) : (
        <div className="overflow-x-auto border border-rule bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper/60 text-[11px] uppercase tracking-wide text-ink-3">
                <th className="py-2.5 pl-4 pr-3 font-semibold">Requisition</th>
                <th className="py-2.5 pr-4 font-semibold">Test & Dept</th>
                <th className="py-2.5 pr-4 font-semibold">Patient</th>
                <th className="py-2.5 pr-4 font-semibold">Ordering clinician</th>
                <th className="py-2.5 pr-4 font-semibold">Ordered</th>
                <th className="py-2.5 pr-4 font-semibold">Status</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {filtered.map((order) => {
                const isSelected = selectedOrder?.id === order.id
                return (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className={`cursor-pointer hover:bg-paper/50 ${isSelected ? 'bg-paper' : ''}`}
                  >
                    <td className="py-3 pl-4 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-ink">{order.id}</span>
                        {order.priority === 'urgent' && (
                          <span className="border border-alert bg-alert/10 px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider text-alert">
                            Urgent
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-[11px] text-ink-3">{order.encounterId}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-ink">{order.testName}</p>
                      <p className="text-xs text-ink-3">{order.department || 'Laboratory'}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-ink">{order.patientName || order.patientId}</p>
                      <p className="text-xs text-ink-3">
                        {order.patientAge ? `${order.patientAge}y · ` : ''}{order.patientGender || ''} · <span className="font-mono">{order.patientId}</span>
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-ink-2">{order.orderingDoctor}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-ink-3">
                      {new Date(order.orderedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      <br />
                      <span className="text-[10px]">{new Date(order.orderedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedOrder(order)
                        }}
                        className="min-h-11 px-3 text-xs font-semibold text-accent-ink underline underline-offset-2 hover:text-ink"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Selected Order Detail Drawer */}
      {selectedOrder && (
        <div className="border-2 border-accent bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-ink">{selectedOrder.id}</span>
                <StatusBadge status={selectedOrder.status} />
                {selectedOrder.priority === 'urgent' && (
                  <span className="border border-alert bg-alert text-surface px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                    STAT / Urgent
                  </span>
                )}
              </div>
              <h2 className="mt-1 text-xl font-semibold text-ink">{selectedOrder.testName}</h2>
              <p className="text-xs text-ink-3">Requisition for {selectedOrder.department || 'Clinical Laboratory'}</p>
            </div>
            <button
              onClick={() => setSelectedOrder(null)}
              className="min-h-11 border border-rule px-4 text-xs font-semibold uppercase tracking-wider text-ink-2 hover:bg-paper"
            >
              Close panel
            </button>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Patient & UHID</p>
              <p className="mt-1 text-sm font-semibold text-ink">{selectedOrder.patientName || 'Unnamed'}</p>
              <p className="font-mono text-xs text-ink-2">
                UHID: {selectedOrder.patientUhid || selectedOrder.patientId} · {selectedOrder.patientAge}y · {selectedOrder.patientGender}
              </p>
              <p className="font-mono text-xs text-ink-3">Visit: {selectedOrder.visitNo || selectedOrder.encounterId} · {selectedOrder.opIp || 'IP'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Clinician & Department</p>
              <p className="mt-1 text-sm font-semibold text-ink">{selectedOrder.orderingDoctor}</p>
              <p className="text-xs text-ink-2">Ref Dr: {selectedOrder.referralDoctor || selectedOrder.orderingDoctor}</p>
              <p className="font-mono text-xs text-ink-3">LabNo: {selectedOrder.labNo || selectedOrder.id}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Specimen Spec</p>
              <p className="mt-1 text-sm font-medium text-ink">{selectedOrder.sampleType || 'Standard Specimen'}</p>
              <p className="text-xs text-ink-3">{selectedOrder.sampleContainer || 'Container unassigned'}</p>
              {selectedOrder.sampleBarcode && <p className="font-mono text-xs text-accent-ink mt-0.5">{selectedOrder.sampleBarcode}</p>}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Timeline Timestamps</p>
              <p className="mt-1 font-mono text-xs text-ink">
                Reg: {new Date(selectedOrder.orderedAt).toLocaleString()}
              </p>
              {selectedOrder.collectedAt && (
                <p className="font-mono text-xs text-ink-3">
                  Coll: {new Date(selectedOrder.collectedAt).toLocaleTimeString()}
                </p>
              )}
              {selectedOrder.approvedAt && (
                <p className="font-mono text-xs text-accent-ink font-semibold">
                  Approved: {new Date(selectedOrder.approvedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>

          {selectedOrder.handlingNote && (
            <div className="mt-4 border-l-2 border-warn bg-warn/5 p-3 text-xs text-ink">
              <strong className="font-semibold text-warn">Handling Instructions: </strong>
              {selectedOrder.handlingNote}
            </div>
          )}

          {selectedOrder.statusReason && (
            <div className="mt-4 border-l-2 border-alert bg-alert/5 p-3 text-xs text-alert">
              <strong className="font-semibold">Reason Logged: </strong>
              {selectedOrder.statusReason}
            </div>
          )}

          {/* Workflow Action Buttons */}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
            {selectedOrder.status === 'requested' && (
              <button
                onClick={() => handleAdvanceStatus(selectedOrder, 'collection_pending')}
                className="min-h-11 rounded-sm bg-accent px-4 text-xs font-semibold text-surface hover:bg-accent-ink"
              >
                Send to Phlebotomy / Collection
              </button>
            )}

            {selectedOrder.status === 'collection_pending' && (
              <Link
                to={`/lab/samples?order=${selectedOrder.id}`}
                className="flex min-h-11 items-center rounded-sm bg-accent px-4 text-xs font-semibold text-surface hover:bg-accent-ink"
              >
                Proceed to Sample Tracking
              </Link>
            )}

            {['collected', 'processing'].includes(selectedOrder.status) && (
              <Link
                to={`/lab/results?order=${selectedOrder.id}`}
                className="flex min-h-11 items-center rounded-sm bg-accent px-4 text-xs font-semibold text-surface hover:bg-accent-ink"
              >
                Open in Result Entry Workbench
              </Link>
            )}

            {selectedOrder.status === 'awaiting_verification' && (
              <Link
                to={`/lab/verification?order=${selectedOrder.id}`}
                className="flex min-h-11 items-center rounded-sm bg-accent px-4 text-xs font-semibold text-surface hover:bg-accent-ink"
              >
                Open in Verification Queue
              </Link>
            )}

            {['verified', 'released', 'awaiting_verification'].includes(selectedOrder.status) && (
              <button
                type="button"
                onClick={() => setReportOrder(selectedOrder)}
                className="flex min-h-11 items-center rounded-sm bg-deep px-4 text-xs font-semibold text-surface hover:bg-ink"
              >
                View laboratory report
              </button>
            )}

            {!['cancelled', 'released', 'verified'].includes(selectedOrder.status) && (
              <button
                onClick={() => handleCancel(selectedOrder)}
                className="min-h-11 rounded-sm border border-alert px-4 text-xs font-semibold text-alert hover:bg-alert/10"
              >
                Cancel Requisition
              </button>
            )}
          </div>
        </div>
      )}

      {/* Full Hospital Diagnostic Report Preview Modal */}
      {reportOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-deep/80 p-2 sm:p-6 print:p-0">
          <DiagnosticReportView
            order={reportOrder}
            onClose={() => setReportOrder(null)}
          />
        </div>
      )}

      {/* AI Document Vision Scanner Modal */}
      {showScannerModal && (
        <AIScannerModal
          onClose={() => setShowScannerModal(false)}
          onImportSuccess={(newOrder) => {
            setOrders((prev) => [newOrder, ...prev])
            setSelectedOrder(newOrder)
            setShowScannerModal(false)
            setReportOrder(newOrder)
          }}
        />
      )}

      {/* New Requisition Modal */}
      {showNewModal && (
        <NewRequisitionModal
          onClose={() => setShowNewModal(false)}
          onCreated={(created) => {
            setOrders((prev) => [created, ...prev])
            setSelectedOrder(created)
            setShowNewModal(false)
          }}
        />
      )}
    </div>
  )
}

