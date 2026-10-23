import { STATUS_META } from '../status'
import type { LabOrderStatus } from '../types'

export default function StatusBadge({ status }: { status: LabOrderStatus }) {
  const m = STATUS_META[status]
  return (
    <span className={`inline-block whitespace-nowrap rounded-sm border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${m.badge}`}>
      {m.label}
    </span>
  )
}
