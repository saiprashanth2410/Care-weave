import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getLabOrders, recordSampleCollection, requestOrderRecollection, updateOrderStatus } from '../api'
import StatusBadge from '../components/StatusBadge'
import { useLabUser } from '../useLabUser'
import type { LabOrder } from '../types'

type SampleTab = 'to_collect' | 'in_transit' | 'recollect' | 'all'

const REJECT_REASONS = [
  'Grossly hemolyzed specimen (unsuitable for potassium and enzyme analysis)',
  'Clotted sample in EDTA anticoagulated tube',
  'Quantity not sufficient (QNS) for requested test panel',
  'Specimen mislabelled / name discrepancy with requisition',
  'Container leakage or broken transit seal',
  'Specimen temperature excursion / delayed transport beyond stability window',
]

const SAMPLE_CONTAINERS = [
  'Lavender Top (K2 EDTA) 4.0 mL',
  'Gold Top (SST / Gel separator) 5.0 mL',
  'Red Top (Plain Clot Activator) 6.0 mL',
  'Grey Top (Sodium Fluoride / Potassium Oxalate) 2.0 mL',
  'Light Blue Top (Sodium Citrate 3.2%) 2.7 mL',
  'Green Top (Lithium Heparin) 4.0 mL',
  'Sterile Urine Container (Yellow cap) 60 mL',
  'Heparinized Blood Gas Syringe 2.0 mL',
]

export default function Samples() {
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<SampleTab>('to_collect')
  const [query, setQuery] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(null)
  const [collectionModal, setCollectionModal] = useState<LabOrder | null>(null)
  const [rejectModal, setRejectModal] = useState<LabOrder | null>(null)
  const [searchParams] = useSearchParams()

  // Form states for collection
  const { user } = useLabUser()
  const [collector, setCollector] = useState(user.name)
  const [container, setContainer] = useState(SAMPLE_CONTAINERS[0])
  const [barcode, setBarcode] = useState('')

  // Form state for rejection
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0])
  const [customRejectNote, setCustomRejectNote] = useState('')

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

  const openCollection = (order: LabOrder) => {
    setCollectionModal(order)
    const suffix = (order.id.replace(/\D/g, '') || '7700').slice(-4)
    setBarcode(`SMP-2026-${suffix}`)
    setContainer(order.sampleContainer || SAMPLE_CONTAINERS[0])
  }

  const handleConfirmCollection = async () => {
    if (!collectionModal) return
    const updated = await recordSampleCollection(collectionModal.id, {
      sampleType: collectionModal.sampleType || 'Standard Specimen',
      container,
      barcode,
      collector,
    })
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    setSelectedOrder(updated)
    setCollectionModal(null)
  }

  const handleConfirmRejection = async () => {
    if (!rejectModal) return
    const fullReason = customRejectNote ? `${rejectReason}: ${customRejectNote}` : rejectReason
    const updated = await requestOrderRecollection(rejectModal.id, fullReason)
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    setSelectedOrder(updated)
    setRejectModal(null)
    setCustomRejectNote('')
  }

  const handleReceiveInLab = async (order: LabOrder) => {
    const updated = await updateOrderStatus(order.id, 'processing', {
      processedBy: 'Lab Accession Desk',
    })
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    setSelectedOrder(updated)
  }

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (tab === 'to_collect' && !['requested', 'collection_pending'].includes(o.status)) return false
      if (tab === 'in_transit' && o.status !== 'collected') return false
      if (tab === 'recollect' && o.status !== 'recollect_required') return false

      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        o.id.toLowerCase().includes(q) ||
        (o.sampleBarcode && o.sampleBarcode.toLowerCase().includes(q)) ||
        (o.patientName && o.patientName.toLowerCase().includes(q)) ||
        o.patientId.toLowerCase().includes(q) ||
        o.testName.toLowerCase().includes(q)
      )
    })
  }, [orders, tab, query])

  const counts = {
    to_collect: orders.filter((o) => ['requested', 'collection_pending'].includes(o.status)).length,
    in_transit: orders.filter((o) => o.status === 'collected').length,
    recollect: orders.filter((o) => o.status === 'recollect_required').length,
    all: orders.length,
  }

  return (
    <div className="min-w-0 space-y-6">
      {/* Header */}
      <div className="border-b border-ink pb-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Sample tracking</h1>
        <p className="mt-1 text-sm text-ink-2">Phlebotomy accessioning, specimen transport, and rejection handling.</p>
      </div>

      {/* Metrics Row */}
      <section aria-label="Sample counts" className="grid grid-cols-1 gap-px border border-rule bg-rule sm:grid-cols-3">
        <div className="bg-surface p-4">
          <p className="text-3xl font-semibold tabular-nums text-ink">{counts.to_collect}</p>
          <p className="mt-1 text-xs text-ink-2">Awaiting phlebotomy / collection</p>
        </div>
        <div className="bg-surface p-4">
          <p className="text-3xl font-semibold tabular-nums text-accent-ink">{counts.in_transit}</p>
          <p className="mt-1 text-xs text-ink-2">Specimens collected / in transit to lab</p>
        </div>
        <div className="bg-surface p-4">
          <p className={`text-3xl font-semibold tabular-nums ${counts.recollect > 0 ? 'text-alert' : 'text-ink'}`}>
            {counts.recollect}
          </p>
          <p className="mt-1 text-xs text-ink-2">Recollection required (rejected specimens)</p>
        </div>
      </section>

      {/* Tab Filter */}
      <div className="flex flex-wrap items-center gap-1 border-b border-rule pb-2" role="tablist">
        {(
          [
            ['to_collect', `To Collect (${counts.to_collect})`],
            ['in_transit', `In Transit / Received (${counts.in_transit})`],
            ['recollect', `Recollection Queue (${counts.recollect})`],
            ['all', `All Records (${counts.all})`],
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

      {/* Search Input */}
      <div>
        <label htmlFor="sample-search" className="sr-only">Search samples</label>
        <input
          id="sample-search"
          type="search"
          placeholder="Filter by barcode, order ID, patient or test..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full min-h-11 border border-rule bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="h-64 animate-pulse bg-rule/50" aria-busy="true" />
      ) : filtered.length === 0 ? (
        <div className="border border-rule bg-surface p-12 text-center text-sm text-ink-3">
          No specimens found in this queue.
        </div>
      ) : (
        <div className="overflow-x-auto border border-rule bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper/60 text-[11px] uppercase tracking-wide text-ink-3">
                <th className="py-2.5 pl-4 pr-3 font-semibold">Specimen Barcode</th>
                <th className="py-2.5 pr-4 font-semibold">Requisition & Test</th>
                <th className="py-2.5 pr-4 font-semibold">Patient</th>
                <th className="py-2.5 pr-4 font-semibold">Specimen Type & Container</th>
                <th className="py-2.5 pr-4 font-semibold">Status</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Actions</th>
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
                    <td className="py-3 pl-4 pr-3 font-mono text-xs">
                      {order.sampleBarcode ? (
                        <div>
                          <span className="font-semibold text-ink">{order.sampleBarcode}</span>
                          {order.collectedBy && <p className="text-[10px] text-ink-3">{order.collectedBy}</p>}
                        </div>
                      ) : (
                        <span className="text-ink-3">Unaccessioned</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-ink">{order.testName}</span>
                        {order.priority === 'urgent' && (
                          <span className="border border-alert px-1 text-[10px] font-bold uppercase text-alert">STAT</span>
                        )}
                      </div>
                      <p className="font-mono text-xs text-ink-3">{order.id} · {order.orderingDoctor}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-ink">{order.patientName || order.patientId}</p>
                      <p className="font-mono text-xs text-ink-3">{order.patientId}</p>
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      <p className="font-medium text-ink">{order.sampleType || 'Blood'}</p>
                      <p className="text-ink-3">{order.sampleContainer || 'Container pending'}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {['requested', 'collection_pending'].includes(order.status) && (
                          <button
                            onClick={() => openCollection(order)}
                            className="min-h-11 rounded-sm bg-accent px-3 text-xs font-semibold text-surface hover:bg-accent-ink"
                          >
                            Collect
                          </button>
                        )}

                        {order.status === 'collected' && (
                          <button
                            onClick={() => handleReceiveInLab(order)}
                            className="min-h-11 rounded-sm bg-deep px-3 text-xs font-semibold text-surface hover:bg-ink"
                          >
                            Receive in Lab
                          </button>
                        )}

                        {!['recollect_required', 'cancelled', 'verified', 'released'].includes(order.status) && (
                          <button
                            onClick={() => setRejectModal(order)}
                            className="min-h-11 rounded-sm border border-alert px-3 text-xs font-semibold text-alert hover:bg-alert/10"
                          >
                            Reject
                          </button>
                        )}

                        {order.status === 'processing' && (
                          <Link
                            to={`/lab/results?order=${order.id}`}
                            className="flex min-h-11 items-center px-2 text-xs font-semibold text-accent-ink underline"
                          >
                            Results
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Collection Modal */}
      {collectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-deep/60">
          <div className="w-full max-w-lg border-2 border-accent bg-surface p-6">
            <div className="border-b border-rule pb-3">
              <h2 className="text-lg font-semibold text-ink">Record specimen collection</h2>
              <p className="text-xs text-ink-3">
                {collectionModal.id} · {collectionModal.testName} · {collectionModal.patientName}
              </p>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Specimen Accession Barcode
                </label>
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full min-h-11 border border-rule bg-paper px-3 font-mono text-sm text-ink"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Collection Container / Tube Type
                </label>
                <select
                  value={container}
                  onChange={(e) => setContainer(e.target.value)}
                  className="w-full min-h-11 border border-rule bg-paper px-3 text-sm text-ink"
                >
                  {SAMPLE_CONTAINERS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Phlebotomist / Collector Staff
                </label>
                <input
                  type="text"
                  value={collector}
                  onChange={(e) => setCollector(e.target.value)}
                  className="w-full min-h-11 border border-rule bg-paper px-3 text-sm text-ink"
                />
              </div>

              <div className="border-l-2 border-accent bg-accent/5 p-3 text-xs text-ink">
                <strong>Chain of Custody: </strong> Specimen timestamp will be logged automatically upon submission.
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-rule pt-4">
              <button
                onClick={() => setCollectionModal(null)}
                className="min-h-11 border border-rule px-4 text-xs font-semibold text-ink-2 hover:bg-paper"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCollection}
                className="min-h-11 bg-accent px-5 text-xs font-semibold text-surface hover:bg-accent-ink"
              >
                Confirm Specimen Collected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject / Recollect Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-deep/60">
          <div className="w-full max-w-lg border-2 border-alert bg-surface p-6">
            <div className="border-b border-rule pb-3">
              <h2 className="text-lg font-semibold text-alert">Flag specimen for recollection</h2>
              <p className="text-xs text-ink-3">
                {rejectModal.id} · {rejectModal.testName} · {rejectModal.patientName}
              </p>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Primary Rejection Reason
                </label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full min-h-11 border border-rule bg-paper px-3 text-sm text-ink"
                >
                  {REJECT_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Additional Clinical Notes for Phlebotomy Team
                </label>
                <textarea
                  rows={3}
                  value={customRejectNote}
                  onChange={(e) => setCustomRejectNote(e.target.value)}
                  placeholder="e.g. Please redraw using 21G needle with minimal tourniquet time..."
                  className="w-full border border-rule bg-paper p-3 text-sm text-ink"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-rule pt-4">
              <button
                onClick={() => setRejectModal(null)}
                className="min-h-11 border border-rule px-4 text-xs font-semibold text-ink-2 hover:bg-paper"
              >
                Dismiss
              </button>
              <button
                onClick={handleConfirmRejection}
                className="min-h-11 bg-alert px-5 text-xs font-semibold text-surface hover:bg-alert/90"
              >
                Order Recollection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
