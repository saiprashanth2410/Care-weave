import type { Appointment } from '../types'

interface OPTokenPrintModalProps {
  appointment: Appointment
  tokenIndex?: number
  roomNumber?: string
  onClose: () => void
}

export default function OPTokenPrintModal({
  appointment,
  tokenIndex = 1,
  roomNumber = 'Room 4',
  onClose,
}: OPTokenPrintModalProps) {
  const tokenNumber = `A-${String(tokenIndex).padStart(3, '0')}`
  const now = new Date()
  const dateStr = now.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-deep/80 overflow-y-auto print:p-0 print:bg-transparent">
      <div className="w-full max-w-sm border-2 border-accent bg-surface p-5 space-y-4 print:border-none print:p-0 print:max-w-none print:w-auto">
        {/* Modal Controls (Hidden in Print) */}
        <div className="flex items-center justify-between border-b border-rule pb-2 print:hidden">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">
              Front Desk Thermal Slip
            </span>
            <p className="text-xs text-ink-3">80mm Receipt / Patient Token Print</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-8 border border-rule px-3 text-xs font-semibold text-ink-2 hover:bg-paper"
          >
            Close
          </button>
        </div>

        {/* ─── PRINTABLE 80MM THERMAL SLIP ─────────────────────────────── */}
        <div
          id="printable-token-slip"
          className="border-2 border-dashed border-rule bg-paper p-5 font-mono text-xs text-ink space-y-3 print:border-none print:p-2 print:bg-white"
        >
          {/* Header */}
          <div className="text-center border-b border-rule pb-3">
            <p className="text-sm font-bold tracking-tight uppercase">CareWeave</p>
            <p className="text-[10px] text-ink-2">CareWeave Outpatient Department</p>
            <div className="my-2 border-t border-dotted border-rule" />
            <p className="text-[11px] uppercase font-bold tracking-wider">Outpatient Consultation Token</p>
          </div>

          {/* Token Hero Display */}
          <div className="text-center py-2 bg-surface border border-rule">
            <span className="text-[11px] font-bold uppercase tracking-widest text-ink-3">Your Queue Token</span>
            <div className="text-3xl font-extrabold text-accent-ink tracking-widest my-1">{tokenNumber}</div>
            <div className="inline-block bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent-ink uppercase">
              {roomNumber} · {appointment.doctorName || 'Dr. ANIRBAN LAHA'}
            </div>
          </div>

          {/* Patient Details */}
          <div className="space-y-1.5 border-b border-dotted border-rule pb-3 text-[11px]">
            <div className="flex justify-between">
              <span className="text-ink-3 uppercase">Patient Name:</span>
              <strong className="text-ink">{appointment.patientName}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3 uppercase">UHID:</span>
              <strong>{appointment.patientIdCode || 'CW-618135'}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3 uppercase">Consultation:</span>
              <span>{appointment.reason || 'General Medicine'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3 uppercase">Check-in Time:</span>
              <span>{dateStr} {timeStr}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3 uppercase">Triage Status:</span>
              <span className="font-bold text-accent-ink">Priority 2 · Normal OPD</span>
            </div>
          </div>

          {/* Barcode & Tear-off Notice */}
          <div className="text-center pt-1 space-y-1">
            <div className="tracking-[0.25em] text-lg font-bold">||| | |||| | || | |||| |||</div>
            <p className="text-[9px] text-ink-3">
              Please be seated in the waiting lobby. Your token number will be called on the OPD display screen outside {roomNumber}.
            </p>
            <p className="text-[8px] text-ink-3 pt-1">
              * Valid for today only. Keep this slip until consultation is complete.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-11 border border-rule bg-paper text-xs font-semibold text-ink-2 hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 min-h-11 bg-accent text-xs font-bold uppercase tracking-wider text-surface hover:bg-accent-ink shadow-sm flex items-center justify-center gap-1.5"
          >
            🖨️ Print Thermal Slip
          </button>
        </div>
      </div>
    </div>
  )
}

