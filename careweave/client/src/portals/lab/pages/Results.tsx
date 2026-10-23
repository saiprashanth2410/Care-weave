import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { amendResults, attachReport, getLabOrders, openReportFile, recordTestResults, TEST_TEMPLATES } from '../api'
import AIScannerModal from '../components/AIScannerModal'
import StatusBadge from '../components/StatusBadge'
import type { LabOrder, ResultFlag, TestResultItem } from '../types'

export default function Results() {
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [activeOrder, setActiveOrder] = useState<LabOrder | null>(null)
  const [results, setResults] = useState<TestResultItem[]>([])
  const [techNotes, setTechNotes] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [observedAt, setObservedAt] = useState(toLocalInput(new Date()))
  const [amendReason, setAmendReason] = useState('')
  const [searchParams] = useSearchParams()

  const selectOrder = (order: LabOrder) => {
    setActiveOrder(order)
    setSaveMessage('')
    setTechNotes(order.technicianNotes || '')
    setAmendReason('')
    setObservedAt(toLocalInput(order.observedAt ? new Date(order.observedAt) : new Date()))

    if (order.results && order.results.length > 0) {
      // Flags are recomputed on load so a value never keeps a flag from an older rule.
      setResults(withFlags(order.results))
    } else {
      // Find matching template or generate default parameters
      const template = TEST_TEMPLATES[order.testName]
      if (template) {
        setResults(template.params.map((p) => ({ ...p })))
      } else {
        setResults([
          { parameter: order.testName, value: '', unit: '', referenceRange: 'Clinical correlation required' },
        ])
      }
    }
  }

  useEffect(() => {
    getLabOrders()
      .then((data) => {
        setOrders(data)
        const orderIdParam = searchParams.get('order')
        const candidate = orderIdParam
          ? data.find((o) => o.id === orderIdParam)
          : data.find((o) => ['collected', 'processing'].includes(o.status)) || data[0]

        if (candidate) selectOrder(candidate)
      })
      .catch(() => {}) // the layout banner reports the failure
      .finally(() => setLoading(false))
  }, [searchParams])

  const handleValueChange = (index: number, val: string) => {
    setResults((prev) => {
      const copy = [...prev]
      const item = { ...copy[index], value: val }
      item.flag = evaluateFlag(item.parameter, val, item.referenceRange)
      copy[index] = item
      return copy
    })
  }

  const isSubmitted = !!activeOrder && ['awaiting_verification', 'verified', 'released'].includes(activeOrder.status)
  const observedIso = () => new Date(observedAt).toISOString()

  const apply = (updated: LabOrder, message: string) => {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    setActiveOrder(updated)
    setResults(updated.results ? withFlags(updated.results) : results)
    setAmendReason('')
    setSaveMessage(message)
  }

  const handleSave = async (submitForVerification: boolean) => {
    if (!activeOrder) return
    const updated = await recordTestResults(activeOrder.id, {
      results,
      notes: techNotes,
      submitForVerification,
      observedAt: observedIso(),
    })
    apply(updated, submitForVerification ? 'Results submitted to the verification queue.' : 'Draft measurements saved.')
  }

  const handleAmend = async () => {
    if (!activeOrder || amendReason.trim().length < 5) return
    const updated = await amendResults(activeOrder.id, results, amendReason.trim(), observedIso())
    apply(updated, 'Amendment recorded. The report goes back to the verification queue.')
  }

  const handleAttach = async (file?: File) => {
    if (!activeOrder || !file) return
    const updated = await attachReport(activeOrder.id, file)
    apply(updated, `Attached ${file.name}.`)
  }

  // Active testing candidates (collected or processing)
  const activeQueue = orders.filter((o) => ['collected', 'processing'].includes(o.status))

  return (
    <div className="min-w-0 space-y-6">
      {/* Header */}
      <div className="border-b border-ink pb-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Result entry</h1>
        <p className="mt-1 text-sm text-ink-2">Laboratory technologist workbench, measurements entry, and validation.</p>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse bg-rule/50" aria-busy="true" />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
          {/* Left Column: Orders in Laboratory Queue */}
          <div className="space-y-4">
            <div className="border-b border-ink pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink">Bench Testing Queue</h2>
              <p className="text-xs text-ink-3">{activeQueue.length} specimens ready for testing</p>
            </div>

            {activeQueue.length === 0 ? (
              <div className="border border-rule bg-surface p-4 text-center text-xs text-ink-3">
                No orders waiting on bench. Check <Link to="/lab/samples" className="text-accent-ink underline">Sample Tracking</Link>.
              </div>
            ) : (
              <ul className="divide-y divide-rule border border-rule bg-surface">
                {activeQueue.map((order) => {
                  const isCurrent = activeOrder?.id === order.id
                  return (
                    <li
                      key={order.id}
                      onClick={() => selectOrder(order)}
                      className={`cursor-pointer p-3 hover:bg-paper/60 ${isCurrent ? 'border-l-4 border-accent bg-paper' : ''}`}
                    >
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="font-mono text-xs font-semibold text-ink">{order.id}</span>
                        {order.priority === 'urgent' && (
                          <span className="border border-alert px-1 text-[10px] font-bold uppercase text-alert">STAT</span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-ink mt-0.5">{order.testName}</p>
                      <p className="text-[11px] text-ink-3">{order.patientName || order.patientId}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <StatusBadge status={order.status} />
                        <span className="font-mono text-[10px] text-ink-3">{order.sampleBarcode}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {/* Other recently processed orders */}
            <div className="pt-4 border-t border-rule">
              <p className="text-xs font-semibold text-ink-3 mb-2">SUBMITTED AND RELEASED (OPEN TO AMEND)</p>
              <ul className="space-y-1">
                {orders
                  .filter((o) => !['collected', 'processing'].includes(o.status))
                  .slice(0, 12)
                  .map((o) => (
                    <li key={o.id}>
                      <button
                        onClick={() => selectOrder(o)}
                        className="w-full text-left p-2 text-xs hover:bg-surface flex items-center justify-between"
                      >
                        <span className="font-mono text-ink-2">{o.id} · {o.testName.slice(0, 18)}...</span>
                        <StatusBadge status={o.status} />
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          </div>

          {/* Right Column: Active Result Entry Workbench */}
          {activeOrder ? (
            <div className="space-y-6 border border-rule bg-surface p-6">
              {/* Order Banner */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold text-ink">{activeOrder.id}</span>
                    <StatusBadge status={activeOrder.status} />
                    {activeOrder.priority === 'urgent' && (
                      <span className="border border-alert bg-alert text-surface px-2 py-0.5 text-[10px] font-bold uppercase">
                        STAT Urgent
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1 text-xl font-semibold text-ink">{activeOrder.testName}</h2>
                  <p className="text-xs text-ink-3">
                    {activeOrder.department} · Specimen: {activeOrder.sampleType || 'Whole blood'} ({activeOrder.sampleContainer || 'Standard container'})
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-ink">{activeOrder.patientName}</p>
                  <p className="font-mono text-xs text-ink-3">
                    ID: {activeOrder.patientId} · {activeOrder.patientAge}y · {activeOrder.patientGender}
                  </p>
                  <p className="font-mono text-xs text-ink-3">Sample: {activeOrder.sampleBarcode || 'Unaccessioned'}</p>
                </div>
              </div>

              {saveMessage && (
                <div role="status" className="border-l-4 border-accent bg-accent/10 p-3 text-xs font-semibold text-accent-ink">
                  {saveMessage}
                </div>
              )}

              {/* Analyte Parameters Entry Table */}
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-ink">Analyte Measurements</h3>
                    <p className="text-xs text-ink-3">Values checked automatically against biological reference intervals</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="flex min-h-9 items-center gap-1.5 rounded-sm border border-accent bg-accent/10 px-3 text-xs font-bold uppercase tracking-wider text-accent-ink hover:bg-accent hover:text-surface"
                  >
                    Scan to fill results
                  </button>
                </div>

                <div className="overflow-x-auto border border-rule">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-rule bg-paper/60 text-[11px] uppercase tracking-wide text-ink-3">
                        <th className="py-2.5 pl-4 pr-4 font-semibold">Analyte Parameter</th>
                        <th className="py-2.5 pr-4 font-semibold">Result Value</th>
                        <th className="py-2.5 pr-4 font-semibold">Unit</th>
                        <th className="py-2.5 pr-4 font-semibold">Reference Interval</th>
                        <th className="py-2.5 pr-4 font-semibold">Flag</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule">
                      {results.map((param, idx) => (
                        <tr key={param.parameter} className="hover:bg-paper/30">
                          <td className="py-3 pl-4 pr-4 font-medium text-ink">{param.parameter}</td>
                          <td className="py-3 pr-4">
                            <input
                              type="text"
                              value={param.value}
                              onChange={(e) => handleValueChange(idx, e.target.value)}
                              placeholder="Enter value"
                              className="w-36 min-h-11 border border-rule bg-paper px-3 font-mono text-sm font-semibold text-ink"
                            />
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs text-ink-3">{param.unit || '—'}</td>
                          <td className="py-3 pr-4 font-mono text-xs text-ink-2">{param.referenceRange}</td>
                          <td className="py-3 pr-4">
                            {param.flag === 'critical' ? (
                              <span className="border border-alert bg-alert/15 px-2 py-0.5 text-[11px] font-bold uppercase text-alert">
                                Critical / Panic
                              </span>
                            ) : param.flag === 'abnormal' ? (
                              <span className="border border-warn bg-warn/15 px-2 py-0.5 text-[11px] font-bold uppercase text-warn">
                                Abnormal
                              </span>
                            ) : param.value && param.flag === 'normal' ? (
                              <span className="text-xs font-semibold text-ink-3">Normal</span>
                            ) : param.value ? (
                              <span className="text-xs font-semibold text-warn">Review against range</span>
                            ) : (
                              <span className="text-xs text-ink-3">Pending</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Observation time */}
              <div className="max-w-xs">
                <label htmlFor="observedAt" className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Observed at *
                </label>
                <input
                  id="observedAt"
                  type="datetime-local"
                  required
                  max={toLocalInput(new Date())}
                  value={observedAt}
                  onChange={(e) => setObservedAt(e.target.value)}
                  className="w-full min-h-11 border border-rule bg-paper px-3 font-mono text-sm text-ink"
                />
                <p className="mt-1 text-[11px] text-ink-3">When the measurement was taken on the analyzer.</p>
              </div>

              {/* Report files */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-ink">Report files</h3>
                  <label className="flex min-h-11 cursor-pointer items-center border border-rule px-4 text-xs font-semibold text-ink-2 hover:bg-paper">
                    Attach PDF, PNG or JPEG
                    <input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden"
                      onChange={(e) => { handleAttach(e.target.files?.[0]); e.target.value = '' }} />
                  </label>
                </div>
                {(activeOrder.attachments ?? []).length === 0 ? (
                  <p className="mt-2 text-xs text-ink-3">No files attached yet.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-rule border border-rule">
                    {activeOrder.attachments!.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                        <span><span className="font-semibold text-ink">{a.name}</span> <span className="text-ink-3">· {Math.round(a.size / 1024)} KB · {a.uploadedBy}</span></span>
                        <button type="button" onClick={() => openReportFile(activeOrder.id, a.id)} className="min-h-11 px-2 font-semibold text-accent-ink underline underline-offset-2">Open</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Amendment history */}
              {(activeOrder.amendments ?? []).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-ink">Amendment history</h3>
                  <ul className="mt-2 divide-y divide-rule border border-rule text-xs">
                    {activeOrder.amendments!.map((a) => (
                      <li key={a.id} className="px-3 py-2">
                        <p><span className="font-semibold text-ink">{a.byName}</span> <span className="text-ink-3">· {new Date(a.at).toLocaleString()}</span></p>
                        <p className="text-ink-2">Reason: {a.reason}</p>
                        <ul className="mt-1 font-mono text-ink-2">
                          {a.changes.map((c) => (
                            <li key={c.parameter}>{c.parameter}: {c.before ? `${c.before.value} ${c.before.unit}` : 'new'} {'->'} {c.after.value} {c.after.unit}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Technician Notes */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Bench Observations / Equipment Verification Remarks
                </label>
                <textarea
                  rows={2}
                  value={techNotes}
                  onChange={(e) => setTechNotes(e.target.value)}
                  placeholder="e.g. Analyzed on Roche Cobas c501. Calibrator batch: #8841-A. Quality control passed."
                  className="w-full border border-rule bg-paper p-3 text-sm text-ink"
                />
              </div>

              {/* Action Buttons */}
              {isSubmitted ? (
                <div className="space-y-3 border-t border-rule pt-4">
                  <div role="note" className="border border-warn p-3 text-xs text-warn">
                    {['verified', 'released'].includes(activeOrder.status)
                      ? 'These results are already verified. Changing a value records an amendment and sends the report back to the verification queue.'
                      : 'These results are waiting for verification. Changing a value records an amendment.'}
                  </div>
                  <label htmlFor="amendReason" className="block text-xs font-semibold uppercase tracking-wider text-ink-3">Reason for the change *</label>
                  <textarea id="amendReason" rows={2} value={amendReason} onChange={(e) => setAmendReason(e.target.value)}
                    placeholder="e.g. Instrument re-run gave a different value"
                    className="w-full border border-rule bg-paper p-3 text-sm text-ink" />
                  <button type="button" onClick={handleAmend} disabled={amendReason.trim().length < 5}
                    className="min-h-11 bg-accent px-6 text-xs font-semibold text-surface hover:bg-accent-ink disabled:cursor-not-allowed disabled:opacity-40">
                    Record amendment
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
                  <button type="button" onClick={() => handleSave(false)}
                    className="min-h-11 border border-rule px-4 text-xs font-semibold text-ink-2 hover:bg-paper">
                    Save draft measurements
                  </button>
                  <button type="button" onClick={() => handleSave(true)}
                    className="min-h-11 bg-accent px-6 text-xs font-semibold text-surface hover:bg-accent-ink">
                    Submit for verification
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="border border-rule bg-surface p-12 text-center text-sm text-ink-3">
              Select an order from the testing queue on the left to enter measurements.
            </div>
          )}
        </div>
      )}

      {/* AI Document Vision Scanner Modal */}
      {showScanner && (
        <AIScannerModal
          onClose={() => setShowScanner(false)}
          onImportSuccess={(newOrder) => {
            setOrders((prev) => [newOrder, ...prev])
            selectOrder(newOrder)
            setShowScanner(false)
          }}
        />
      )}
    </div>
  )
}

function evaluateFlag(param: string, rawVal: string, refRange: string): ResultFlag | undefined {
  const num = parseFloat(rawVal.replace(/,/g, ''))
  if (isNaN(num)) return undefined
  refRange = refRange.replace(/(\d),(?=\d{3})/g, '$1')

  // Critical panic values
  if (param.toLowerCase().includes('troponin') && num > 0.04) return 'critical'
  if (/(^|\s)ph(\s|\(|$)/i.test(param) && (num < 7.30 || num > 7.55)) return 'critical'
  if (param.toLowerCase().includes('potassium') && (num < 3.0 || num > 6.0)) return 'critical'
  if (param.toLowerCase().includes('platelet') && num < 50000) return 'critical'
  if (param.toLowerCase().includes('glucose') && num > 300) return 'critical'

  // Only plain numeric intervals are checked automatically. Text such as "Desirable: < 200, Borderline: 200-239"
  // has several bands, so it is left for the technologist and verifier to judge instead of guessing.
  if (!/^[<>=\s\d.\-\u2013]+$/.test(refRange)) return undefined

  // Standard ranges
  const rangeMatch = refRange.match(/([\d.]+)\s*-\s*([\d.]+)/)
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1])
    const high = parseFloat(rangeMatch[2])
    if (num < low || num > high) return 'abnormal'
    return 'normal'
  }

  const maxMatch = refRange.match(/<\s*([\d.]+)/)
  if (maxMatch) {
    const max = parseFloat(maxMatch[1])
    if (num > max) return 'abnormal'
    return 'normal'
  }

  const minMatch = refRange.match(/>\s*([\d.]+)/)
  if (minMatch) {
    const min = parseFloat(minMatch[1])
    if (num < min) return 'abnormal'
    return 'normal'
  }

  return undefined
}

const withFlags = (rs: TestResultItem[]) => rs.map((r) => ({ ...r, flag: evaluateFlag(r.parameter, r.value, r.referenceRange) }))

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
