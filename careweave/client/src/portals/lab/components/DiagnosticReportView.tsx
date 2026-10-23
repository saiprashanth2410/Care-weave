import type { LabOrder } from '../types'

interface DiagnosticReportProps {
  order: LabOrder
  onClose?: () => void
  onPrint?: () => void
  facilityName?: string
}

export default function DiagnosticReportView({ order, onClose, onPrint, facilityName = 'CareWeave Laboratory' }: DiagnosticReportProps) {
  const handlePrint = () => {
    if (onPrint) {
      onPrint()
    } else {
      window.print()
    }
  }

  // Formatting dates like in the sample reports: "03/08/2026 12:13 PM"
  const formatDate = (iso?: string) => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hours = d.getHours()
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const formattedHours = hours % 12 || 12
    return `${day}/${month}/${year} ${formattedHours}:${minutes} ${ampm}`
  }

  const uhid = order.patientUhid || order.patientNo || order.patientId || '—'
  const visitNo = order.visitNo || order.encounterId || '—'
  const labNo = order.labNo || order.id
  const opIp = order.opIp || 'OP'
  const referralDr = order.referralDoctor || order.orderingDoctor || '—'
  const regDate = formatDate(order.registrationAt || order.orderedAt)
  const collDate = formatDate(order.collectedAt || order.orderedAt)
  const repDate = formatDate(order.reportedAt || order.verifiedAt)
  const appDate = formatDate(order.approvedAt || order.verifiedAt)

  // Group results if any subGroups exist
  const results = order.results || []
  const subGroups = Array.from(new Set(results.map((r) => r.subGroup || order.department || 'GENERAL INVESTIGATIONS')))

  return (
    <div className="bg-paper p-2 sm:p-6 text-slate-900 print:bg-white print:p-0">
      {/* Screen Control Bar (Hidden in Print) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-rule bg-surface p-3 print:hidden">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-ink">Preview: Diagnostic Laboratory Report</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex min-h-10 items-center rounded-sm bg-accent px-4 text-xs font-semibold text-surface hover:bg-accent-ink"
          >
            Print or save as PDF
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 border border-rule bg-paper px-4 text-xs font-semibold text-ink-2 hover:bg-rule"
            >
              Close Preview
            </button>
          )}
        </div>
      </div>

      {/* A4 report sheet */}
      <article
        className="mx-auto w-full max-w-[850px] border border-slate-300 bg-white p-6 sm:p-10 shadow-sm print:max-w-none print:border-none print:p-6 print:shadow-none font-sans"
        style={{ minHeight: '1050px', color: '#1a1a1a' }}
      >
        {/* ===================== LABORATORY HEADER ===================== */}
        <header className="border-b-2 border-slate-800 pb-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl font-serif">{facilityName}</h1>
            <p className="text-sm font-semibold tracking-wide text-slate-800">Laboratory report</p>
          </div>

          {/* Department Bar */}
          <div className="mt-3 border-t border-b border-slate-700 py-1 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-900">
              DEPARTMENT OF LABORATORY SERVICES
            </p>
          </div>
        </header>

        {/* ===================== PATIENT & REQUISITION DEMOGRAPHICS GRID ===================== */}
        <section
          aria-label="Patient Requisition Demographics"
          className="mt-3 border border-slate-300 bg-slate-100/70 p-2.5 text-[11px] leading-tight"
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {/* Left Column */}
            <div className="space-y-1">
              <div className="flex">
                <span className="w-24 font-bold text-slate-700">Patient UHID</span>
                <span className="font-mono font-bold text-slate-900">: {uhid}</span>
              </div>
              <div className="flex">
                <span className="w-24 font-bold text-slate-700">Visit No</span>
                <span className="font-mono text-slate-900">: {visitNo}</span>
              </div>
              <div className="flex">
                <span className="w-24 font-bold text-slate-700">Name</span>
                <span className="font-bold text-slate-900 uppercase">: {order.patientName || '—'}</span>
              </div>
              <div className="flex">
                <span className="w-24 font-bold text-slate-700">Age / Gender</span>
                <span className="text-slate-900">
                  : {order.patientAge || '—'} Year(s) / {order.patientGender === 'M' ? 'Male' : order.patientGender === 'F' ? 'Female' : order.patientGender === 'O' ? 'Other' : 'Not recorded'}
                </span>
              </div>
              <div className="flex">
                <span className="w-24 font-bold text-slate-700">Referral Dr.</span>
                <span className="font-semibold text-slate-900">: {referralDr}</span>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-1">
              <div className="flex">
                <span className="w-28 font-bold text-slate-700">Registration</span>
                <span className="font-mono text-slate-900">: {regDate}</span>
              </div>
              <div className="flex">
                <span className="w-28 font-bold text-slate-700">Collection</span>
                <span className="font-mono text-slate-900">: {collDate}</span>
              </div>
              <div className="flex">
                <span className="w-28 font-bold text-slate-700">OP / IP</span>
                <span className="font-bold text-slate-900">: {opIp}</span>
              </div>
              <div className="flex">
                <span className="w-28 font-bold text-slate-700">Reported</span>
                <span className="font-mono text-slate-900">: {repDate}</span>
              </div>
              <div className="flex">
                <span className="w-28 font-bold text-slate-700">Approved at</span>
                <span className="font-mono text-slate-900">: {appDate}</span>
              </div>
              <div className="flex">
                <span className="w-28 font-bold text-slate-700">LabNo</span>
                <span className="font-mono text-slate-900">: {labNo}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== INVESTIGATIONS TABLE ===================== */}
        <section className="mt-4">
          <div className="border-b-2 border-slate-800 pb-1 pt-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-800">
            <span className="w-2/5">Investigations</span>
            <span className="w-1/5 text-left">Result</span>
            <span className="w-1/6 text-left">Units</span>
            <span className="w-1/4 text-right">Reference Range</span>
          </div>

          {/* Group Loop */}
          <div className="divide-y divide-slate-200">
            {subGroups.map((group) => {
              const groupItems = results.filter((r) => (r.subGroup || order.department || 'GENERAL INVESTIGATIONS') === group)
              return (
                <div key={group} className="pt-3 pb-2">
                  {/* Department / SubGroup Header */}
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 underline underline-offset-2 mb-2">
                    {group}
                  </h2>

                  {/* Individual Tests */}
                  <div className="space-y-2">
                    {groupItems.map((item) => {
                      const isAbnormal = item.flag === 'abnormal' || item.flag === 'critical'
                      return (
                        <div
                          key={item.parameter}
                          className="flex items-baseline justify-between text-xs py-1 hover:bg-slate-50"
                        >
                          {/* Parameter Name & Method */}
                          <div className="w-2/5 pr-2">
                            <p className="font-semibold text-slate-900">{item.parameter}</p>
                            {item.methodology && (
                              <p className="text-[10px] text-slate-500 italic leading-tight">
                                ({item.methodology})
                              </p>
                            )}
                          </div>

                          {/* Result Value */}
                          <div className="w-1/5 text-left font-mono">
                            <span
                              className={`text-sm ${
                                isAbnormal
                                  ? 'font-extrabold text-slate-950 underline decoration-slate-900 underline-offset-2'
                                  : 'font-medium text-slate-800'
                              }`}
                            >
                              {item.value || '—'}
                            </span>
                            {isAbnormal && (
                              <span className="ml-1 text-[10px] font-bold text-rose-700">*</span>
                            )}
                          </div>

                          {/* Units */}
                          <div className="w-1/6 text-left font-mono text-[11px] text-slate-700">
                            {item.unit || '—'}
                          </div>

                          {/* Reference Interval */}
                          <div className="w-1/4 text-right font-mono text-[11px] text-slate-700 whitespace-pre-line">
                            {item.referenceRange}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* End of Report Rule */}
          <div className="my-6 text-center text-xs font-semibold text-slate-500">
            -- End of Report --
          </div>
        </section>

        {(order.observedAt || (order.amendments?.length ?? 0) > 0) && (
          <section className="mt-4 border-t border-slate-300 pt-2 text-[11px] text-slate-700">
            {order.observedAt && <p>Observed on analyzer: {formatDate(order.observedAt)}</p>}
            {(order.amendments?.length ?? 0) > 0 && (
              <div className="mt-1">
                <p className="font-bold">Amended {order.amendments!.length} time(s) after first submission.</p>
                <ul className="list-disc pl-4">
                  {order.amendments!.map((a) => (
                    <li key={a.id}>
                      {formatDate(a.at)} by {a.byName}: {a.reason} ({a.changes.map((c) => `${c.parameter} ${c.before ? c.before.value : 'new'} -> ${c.after.value}`).join('; ')})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* ===================== SIGNATURES BLOCK ===================== */}
        <section className="mt-8 border-t border-slate-300 pt-4">
          <div className="flex items-end justify-between px-4 sm:px-12">
            <div className="min-w-40 text-center">
              <div className="h-10" />
              <p className="border-t border-slate-700 pt-1 text-xs font-bold text-slate-900">
                {order.processedBy || '—'}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">(Processed by)</p>
            </div>
            <div className="min-w-40 text-center">
              <div className="h-10" />
              <p className="border-t border-slate-700 pt-1 text-xs font-bold text-slate-900">
                {order.verifiedBy || 'Not yet verified'}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">(Verified and released by)</p>
            </div>
          </div>
        </section>

        {/* ===================== FOOTER ===================== */}
        <footer className="mt-6 border-t-2 border-slate-800 pt-3 text-[10px] text-slate-700">
          <div className="mt-2 text-center space-y-0.5 text-[9px]">
            <div className="flex justify-between pt-1 font-mono text-[8px] text-slate-500">
              <span>{order.id}</span>
              <span>Page 1 of 1</span>
            </div>
          </div>
        </footer>
      </article>
    </div>
  )
}
