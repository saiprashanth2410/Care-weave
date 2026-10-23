import type { LabOrder } from '../types'

interface DiagnosticReportProps {
  order: LabOrder
  onClose?: () => void
  onPrint?: () => void
}

export default function DiagnosticReportView({ order, onClose, onPrint }: DiagnosticReportProps) {
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

  const uhid = order.patientUhid || order.patientNo || order.patientId.replace(/\D/g, '') || '618135'
  const visitNo = order.visitNo || order.encounterId.replace(/\D/g, '') || '3882620'
  const labNo = order.labNo || order.id.replace(/\D/g, '') || '2057808'
  const opIp = order.opIp || 'IP'
  const referralDr = order.referralDoctor || order.orderingDoctor || 'Dr. ANIRBAN LAHA'
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
          <span className="rounded bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent-ink uppercase">
            NABL / NABH Accredited Format
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex min-h-10 items-center rounded-sm bg-accent px-4 text-xs font-semibold text-surface hover:bg-accent-ink"
          >
            🖨️ Print / Save as PDF
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

      {/* Official A4 Sheet (Matches Dr. Kamakshi Memorial Hospital Format exactly) */}
      <article
        className="mx-auto w-full max-w-[850px] border border-slate-300 bg-white p-6 sm:p-10 shadow-sm print:max-w-none print:border-none print:p-6 print:shadow-none font-sans"
        style={{ minHeight: '1050px', color: '#1a1a1a' }}
      >
        {/* ===================== HOSPITAL HEADER ===================== */}
        <header className="border-b-2 border-slate-800 pb-3">
          <div className="flex items-start justify-between gap-4">
            {/* Hospital Logo & Brand */}
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-rose-800 bg-rose-50 text-rose-800 font-bold text-xl">
                ⚕️
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl font-serif">
                  Dr.Kamakshi
                </h1>
                <p className="text-sm font-semibold tracking-wide text-slate-800">
                  Memorial Hospital Pvt. Ltd.
                </p>
                <p className="text-[11px] italic text-rose-900 font-serif">
                  Your Health is Our Responsibility...
                </p>
              </div>
            </div>

            {/* Accreditation Emblems (NABL & NABH) */}
            <div className="flex items-center gap-3 text-right">
              {/* NABL Badge */}
              <div className="text-center">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-50 text-[10px] font-bold text-slate-800">
                  NABL
                </div>
                <p className="font-mono text-[9px] font-bold text-slate-700 mt-0.5">MC-2128</p>
              </div>

              {/* NABH Badge */}
              <div className="text-center">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-rose-800 bg-rose-50 text-[9px] font-extrabold text-rose-900">
                  NABH
                </div>
                <p className="font-mono text-[8px] font-semibold text-slate-600 mt-0.5">H-2023-1248</p>
                <p className="text-[7px] text-slate-500">2023 - 2027</p>
              </div>
            </div>
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
                <span className="font-bold text-slate-900 uppercase">: {order.patientName || 'Mrs. DEEPA.S'}</span>
              </div>
              <div className="flex">
                <span className="w-24 font-bold text-slate-700">Age / Gender</span>
                <span className="text-slate-900">
                  : {order.patientAge || 43} Year(s) / {order.patientGender === 'M' ? 'Male' : order.patientGender === 'F' ? 'Female' : 'Other'}
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

        {/* ===================== SIGNATURES BLOCK ===================== */}
        <section className="mt-8 border-t border-slate-300 pt-4">
          <div className="flex items-end justify-between px-4 sm:px-12">
            {/* Consultant Pathologist */}
            <div className="text-center">
              {/* Handwritten signature visual */}
              <div className="h-10 flex items-center justify-center font-serif italic text-slate-800 text-lg">
                U.S.Maneesha
              </div>
              <p className="border-t border-slate-700 pt-1 text-xs font-bold text-slate-900">
                DR. U.S. MANEESHA., MBBS, DCP., DNB
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                (CONSULTANT PATHOLOGIST)
              </p>
            </div>

            {/* Head of Laboratory Services */}
            <div className="text-center">
              <div className="h-10 flex items-center justify-center font-serif italic text-slate-800 text-lg">
                Kala.K
              </div>
              <p className="border-t border-slate-700 pt-1 text-xs font-bold text-slate-900">
                Dr. KALA.K MD., DNB., DipRCPath
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                (HEAD OF LABORATORY SERVICES)
              </p>
            </div>
          </div>

          {/* Legal Disclaimer */}
          <p className="mt-6 text-center text-[9px] text-slate-500 italic">
            * This office template is used ONLY for medical advice, medical reporting and office use. NOT for issuance of certificates.
          </p>
        </section>

        {/* ===================== HOSPITAL FOOTER ===================== */}
        <footer className="mt-6 border-t-2 border-slate-800 pt-3 text-[10px] text-slate-700">
          {/* 3 Contact Columns */}
          <div className="grid grid-cols-3 gap-2 border-b border-slate-300 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-rose-800">🏥 Doctor Appointments</span>
              <span className="font-mono font-medium">044 71 200 299</span>
            </div>
            <div className="flex items-center gap-1.5 justify-center">
              <span className="font-bold text-rose-800">🏠 Home Sample Collection</span>
              <span className="font-mono font-medium">044 71 200 266</span>
            </div>
            <div className="flex items-center gap-1.5 justify-end">
              <span className="font-bold text-rose-800">🚑 Emergency Ambulance</span>
              <span className="font-mono font-bold text-rose-900">044 66 300 500</span>
            </div>
          </div>

          {/* Address & Corporate Info */}
          <div className="mt-2 text-center space-y-0.5 text-[9px]">
            <p className="font-semibold text-slate-800">
              #1, Radial Road, Pallikaranai, Chennai - 600 100. Tamilnadu, India.
            </p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-0.5 text-slate-600 font-mono">
              <span>📞 044 66 300 300 / 71 200 200</span>
              <span>💬 WhatsApp: 89 39 900 500</span>
              <span>✉️ info@drkmh.com</span>
              <span>🌐 www.drkmh.com</span>
            </div>
            <div className="flex justify-between pt-1 font-mono text-[8px] text-slate-500">
              <span>CIN: U85110TN2004PTC054715</span>
              <span>Page 1 of 1</span>
            </div>
          </div>
        </footer>
      </article>
    </div>
  )
}
