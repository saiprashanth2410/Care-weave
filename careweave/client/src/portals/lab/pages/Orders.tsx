import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  createLabOrder,
  getDoctors,
  getLabOrders,
  type RegisteredPatient,
  searchRegisteredPatients,
  TEST_TEMPLATES,
  updateOrderStatus,
} from '../api'
import AIScannerModal from '../components/AIScannerModal'
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

  // New Requisition Form State
  const [newPatientName, setNewPatientName] = useState('')
  const [newUhid, setNewUhid] = useState('')
  const [newVisitNo, setNewVisitNo] = useState('')
  const [newOpIp, setNewOpIp] = useState<'OP' | 'IP'>('IP')
  const [newPatientAge, setNewPatientAge] = useState<number | ''>('')
  const [newPatientGender, setNewPatientGender] = useState<'' | 'M' | 'F' | 'O'>('')
  const [newTestName, setNewTestName] = useState<string>(Object.keys(TEST_TEMPLATES)[0])
  const [newDoctor, setNewDoctor] = useState('')
  const [doctors, setDoctors] = useState<string[]>([])
  const [newPriority, setNewPriority] = useState<Priority>('routine')
  const [newHandlingNote, setNewHandlingNote] = useState('')

  // Central Database Patient Autocomplete
  const [patientSearchQuery, setPatientSearchQuery] = useState('')
  const [patientSearchResults, setPatientSearchResults] = useState<RegisteredPatient[]>([])
  const [selectedPatientRef, setSelectedPatientRef] = useState<RegisteredPatient | null>(null)
  const [isSearchingPatient, setIsSearchingPatient] = useState(false)
  const [selectedEncounterId, setSelectedEncounterId] = useState('')
  const [externalOrder, setExternalOrder] = useState(false)

  useEffect(() => {
    getDoctors()
      .then((list) => {
        setDoctors(list.map((d) => d.name))
        setNewDoctor((cur) => cur || list[0]?.name || '')
      })
      .catch(() => {})
  }, [])

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

  useEffect(() => {
    if (!patientSearchQuery.trim()) return
    const timer = setTimeout(() => {
      setIsSearchingPatient(true)
      searchRegisteredPatients(patientSearchQuery)
        .then((res) => setPatientSearchResults(res))
        .catch(() => setPatientSearchResults([]))
        .finally(() => setIsSearchingPatient(false))
    }, 200)
    return () => clearTimeout(timer)
  }, [patientSearchQuery])

  const handleSelectPatient = (p: RegisteredPatient) => {
    setSelectedPatientRef(p)
    setNewPatientName(p.name)
    setNewUhid(p.patientId)
    setNewPatientAge(p.ageYears)
    setSelectedEncounterId(p.encounters[0]?.id ?? '')
    setExternalOrder(false)
    setNewOpIp('OP')
    setPatientSearchQuery('')
    setPatientSearchResults([])
  }

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

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPatientName.trim() || !newDoctor || newPatientAge === '' || !newPatientGender) return
    if (!selectedPatientRef && !externalOrder) return
    if (selectedPatientRef && !selectedEncounterId) return
    const created = await createLabOrder({
      patientName: newPatientName.trim(),
      patientId: selectedPatientRef?.patientId,
      encounterId: selectedPatientRef ? selectedEncounterId : undefined,
      external: !selectedPatientRef,
      patientUhid: newUhid.trim() || selectedPatientRef?.patientId || undefined,
      visitNo: newVisitNo.trim() || undefined,
      opIp: newOpIp,
      patientAge: Number(newPatientAge),
      patientGender: newPatientGender,
      testName: newTestName,
      orderingDoctor: newDoctor,
      referralDoctor: newDoctor,
      priority: newPriority,
      handlingNote: newHandlingNote.trim() || undefined,
    })
    setOrders((prev) => [created, ...prev])
    setSelectedOrder(created)
    setShowNewModal(false)
    setSelectedPatientRef(null)
    setSelectedEncounterId('')
    setExternalOrder(false)
    setNewPatientGender('')
    setNewPatientName('')
    setNewUhid('')
    setNewVisitNo('')
    setNewHandlingNote('')
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-deep/60 overflow-y-auto">
          <div className="w-full max-w-xl my-8 border-2 border-accent bg-surface p-6 sm:p-8 space-y-6">
            <div className="border-b border-rule pb-3 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-ink">New Laboratory Requisition</h2>
                <p className="text-xs text-ink-3">Register a walk-in patient or internal clinical requisition</p>
              </div>
              <button
                onClick={() => setShowNewModal(false)}
                className="min-h-11 px-3 text-xs font-semibold text-ink-2 hover:bg-paper"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-4">
              {/* Central Database Patient Search & Link */}
              <div className="border border-accent/40 bg-accent/5 p-3 relative">
                <label className="block text-xs font-bold uppercase tracking-wider text-accent-ink mb-1">
                  🔍 Search Central Patient Registry (Registered at Reception)
                </label>
                <div className="relative">
                  <input
                    type="search"
                    placeholder="Type patient name, UHID (e.g. CW-...) or phone number..."
                    value={patientSearchQuery}
                    onChange={(e) => {
                      setPatientSearchQuery(e.target.value)
                      if (!e.target.value.trim()) setPatientSearchResults([])
                    }}
                    className="w-full min-h-11 border border-accent/40 bg-surface px-3 text-sm text-ink placeholder:text-ink-3"
                  />
                  {isSearchingPatient && (
                    <span className="absolute right-3 top-3 text-xs font-mono text-ink-3 animate-pulse">
                      Searching...
                    </span>
                  )}
                </div>

                {/* Dropdown list of matching patients */}
                {patientSearchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-56 overflow-y-auto border-2 border-accent bg-surface shadow-md">
                    <div className="bg-paper px-3 py-1 text-[11px] font-bold text-ink-3 uppercase border-b border-rule">
                      Select Patient to Auto-Fill Requisition ({patientSearchResults.length} found)
                    </div>
                    {patientSearchResults.map((p) => (
                      <button
                        key={p.patientId}
                        type="button"
                        onClick={() => handleSelectPatient(p)}
                        className="w-full text-left p-2.5 hover:bg-paper/80 border-b border-rule last:border-b-0 flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm font-bold text-ink">{p.name}</p>
                          <p className="font-mono text-xs text-ink-2">
                            UHID: <span className="text-accent-ink font-bold">{p.patientId}</span>
                            {` · ${p.ageYears}y`}
                          </p>
                        </div>
                        <span className="text-xs bg-accent/10 border border-accent/30 text-accent-ink font-semibold px-2 py-0.5">
                          Select ↵
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedPatientRef ? (
                  <div className="mt-2 flex items-center justify-between text-xs text-accent-ink font-semibold bg-accent/10 px-2 py-1">
                    <span>✓ Linked to Central Patient: <b>{selectedPatientRef.name}</b> ({selectedPatientRef.patientId})</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPatientRef(null)}
                      className="text-ink-3 hover:text-alert underline"
                    >
                      Clear link
                    </button>
                  </div>
                ) : (
                  <label className="mt-2 flex min-h-11 items-center gap-2 text-xs text-ink-2">
                    <input type="checkbox" checked={externalOrder} onChange={(e) => setExternalOrder(e.target.checked)} />
                    <span>External requisition: this patient is not registered at the front desk. Enter the details below.</span>
                  </label>
                )}
                {selectedPatientRef && (
                  <div className="mt-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">Visit (encounter) *</label>
                    <select
                      required
                      value={selectedEncounterId}
                      onChange={(e) => setSelectedEncounterId(e.target.value)}
                      className="w-full min-h-11 border border-rule bg-paper px-3 text-sm text-ink"
                    >
                      {selectedPatientRef.encounters.length === 0 && <option value="">No visits on record, register one at the front desk</option>}
                      {selectedPatientRef.encounters.map((en) => (
                        <option key={en.id} value={en.id}>{en.date} {en.time} · {en.doctorName}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Patient Demographics */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                    Patient Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Meera Natarajan"
                    value={newPatientName}
                    readOnly={!!selectedPatientRef}
                    onChange={(e) => setNewPatientName(e.target.value)}
                    className="w-full min-h-11 border border-rule bg-paper px-3 text-sm text-ink font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                    Age & Gender *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      required
                      min={1}
                      max={120}
                      value={newPatientAge}
                      readOnly={!!selectedPatientRef}
                      onChange={(e) => setNewPatientAge(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-16 min-h-11 border border-rule bg-paper px-2 text-sm text-ink text-center"
                    />
                    <select
                      required
                      value={newPatientGender}
                      onChange={(e) => setNewPatientGender(e.target.value as '' | 'M' | 'F' | 'O')}
                      className="flex-1 min-h-11 border border-rule bg-paper px-2 text-sm text-ink"
                    >
                      <option value="">Select</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="O">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Hospital identifiers */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                    Patient UHID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 618135"
                    value={newUhid}
                    onChange={(e) => setNewUhid(e.target.value)}
                    className="w-full min-h-11 border border-rule bg-paper px-3 font-mono text-sm text-ink"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                    Visit No (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 3882620"
                    value={newVisitNo}
                    onChange={(e) => setNewVisitNo(e.target.value)}
                    className="w-full min-h-11 border border-rule bg-paper px-3 font-mono text-sm text-ink"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                    Patient Care Type
                  </label>
                  <select
                    value={newOpIp}
                    onChange={(e) => setNewOpIp(e.target.value as 'OP' | 'IP')}
                    className="w-full min-h-11 border border-rule bg-paper px-3 text-sm text-ink"
                  >
                    <option value="IP">IP (Inpatient)</option>
                    <option value="OP">OP (Outpatient)</option>
                  </select>
                </div>
              </div>

              {/* Test Selection */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Requested Diagnostic Test Panel *
                </label>
                <select
                  value={newTestName}
                  onChange={(e) => setNewTestName(e.target.value)}
                  className="w-full min-h-11 border border-rule bg-paper px-3 text-sm text-ink font-medium"
                >
                  {Object.keys(TEST_TEMPLATES).map((t) => (
                    <option key={t} value={t}>
                      {t} ({TEST_TEMPLATES[t].department})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-ink-3">
                  Specimen: {TEST_TEMPLATES[newTestName]?.sampleType} · Container: {TEST_TEMPLATES[newTestName]?.container}
                </p>
              </div>

              {/* Ordering Physician */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Ordering Clinician / Department *
                </label>
                <select
                  value={newDoctor}
                  onChange={(e) => setNewDoctor(e.target.value)}
                  className="w-full min-h-11 border border-rule bg-paper px-3 text-sm text-ink"
                >
                  {doctors.length === 0 && <option value="">No doctors registered</option>}
                  {doctors.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Requisition Urgency / Priority *
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-ink cursor-pointer">
                    <input
                      type="radio"
                      name="priority"
                      value="routine"
                      checked={newPriority === 'routine'}
                      onChange={() => setNewPriority('routine')}
                      className="accent-accent"
                    />
                    Routine Outpatient
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold text-alert cursor-pointer">
                    <input
                      type="radio"
                      name="priority"
                      value="urgent"
                      checked={newPriority === 'urgent'}
                      onChange={() => setNewPriority('urgent')}
                      className="accent-alert"
                    />
                    STAT / Emergency Urgent
                  </label>
                </div>
              </div>

              {/* Clinical Handling Note */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Clinical Indications / Handling Remarks (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newHandlingNote}
                  onChange={(e) => setNewHandlingNote(e.target.value)}
                  placeholder="e.g. Fasting sample verified. Patient on metformin 500mg BD. Rule out acute kidney injury."
                  className="w-full border border-rule bg-paper p-3 text-sm text-ink"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-rule pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="min-h-11 border border-rule px-4 text-xs font-semibold text-ink-2 hover:bg-paper"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-11 bg-accent px-6 text-xs font-semibold text-surface hover:bg-accent-ink"
                >
                  Create & Dispatch Requisition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

