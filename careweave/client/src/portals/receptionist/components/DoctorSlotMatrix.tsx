import { useState } from 'react'

export interface DoctorOPDSlot {
  id: string
  name: string
  specialty: string
  room: string
  shift: 'Morning OPD' | 'Evening OPD' | 'All Day'
  timings: string
  status: 'on_duty' | 'in_consultation' | 'ward_rounds' | 'on_leave'
  currentQueueCount: number
  completedTodayCount: number
  nextAvailableTime: string
}

const DEFAULT_DOCTORS: DoctorOPDSlot[] = [
  {
    id: 'doc-1',
    name: 'Dr. ANIRBAN LAHA',
    specialty: 'General Medicine',
    room: 'Room 4',
    shift: 'All Day',
    timings: '09:00 AM - 01:00 PM & 04:00 PM - 08:00 PM',
    status: 'in_consultation',
    currentQueueCount: 4,
    completedTodayCount: 14,
    nextAvailableTime: '15:10 PM',
  },
  {
    id: 'doc-2',
    name: 'Dr. Rajesh Iyer',
    specialty: 'Cardiology',
    room: 'Room 2',
    shift: 'Morning OPD',
    timings: '09:30 AM - 01:30 PM',
    status: 'on_duty',
    currentQueueCount: 2,
    completedTodayCount: 9,
    nextAvailableTime: '14:55 PM',
  },
  {
    id: 'doc-3',
    name: 'Dr. Priya Sharma',
    specialty: 'Internal Medicine',
    room: 'Room 1',
    shift: 'All Day',
    timings: '08:30 AM - 01:00 PM & 03:00 PM - 06:30 PM',
    status: 'on_duty',
    currentQueueCount: 3,
    completedTodayCount: 11,
    nextAvailableTime: '15:00 PM',
  },
  {
    id: 'doc-4',
    name: 'Dr. Sneha Patil',
    specialty: 'Gastroenterology',
    room: 'Room 3',
    shift: 'Evening OPD',
    timings: '04:00 PM - 08:30 PM',
    status: 'on_duty',
    currentQueueCount: 1,
    completedTodayCount: 6,
    nextAvailableTime: '16:00 PM',
  },
  {
    id: 'doc-5',
    name: 'Dr. Vikram Seth',
    specialty: 'Critical Care / ICU',
    room: 'ICU Block B',
    shift: 'All Day',
    timings: '24/7 Emergency Coverage',
    status: 'ward_rounds',
    currentQueueCount: 0,
    completedTodayCount: 4,
    nextAvailableTime: 'On Call Only',
  },
  {
    id: 'doc-6',
    name: 'Dr. Meenakshi Sundaram',
    specialty: 'Endocrinology & Diabetology',
    room: 'Room 5',
    shift: 'Morning OPD',
    timings: '09:00 AM - 02:00 PM',
    status: 'on_duty',
    currentQueueCount: 5,
    completedTodayCount: 12,
    nextAvailableTime: '15:20 PM',
  },
]

interface DoctorSlotMatrixProps {
  onSelectDoctorForBooking: (doctorName: string) => void
}

export default function DoctorSlotMatrix({ onSelectDoctorForBooking }: DoctorSlotMatrixProps) {
  const [filter, setFilter] = useState<'all' | 'on_duty' | 'active'>('all')
  const [doctors, setDoctors] = useState<DoctorOPDSlot[]>(DEFAULT_DOCTORS)

  const handleToggleStatus = (id: string) => {
    setDoctors((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d
        const next: Record<DoctorOPDSlot['status'], DoctorOPDSlot['status']> = {
          on_duty: 'in_consultation',
          in_consultation: 'ward_rounds',
          ward_rounds: 'on_leave',
          on_leave: 'on_duty',
        }
        return { ...d, status: next[d.status] }
      }),
    )
  }

  const filtered = doctors.filter((d) => {
    if (filter === 'on_duty') return d.status === 'on_duty'
    if (filter === 'active') return ['on_duty', 'in_consultation'].includes(d.status)
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-accent-ink">
            OPD Doctor Roster & Consultation Rooms
          </span>
          <h2 className="text-lg font-bold text-ink">Real-Time Availability & Slot Matrix</h2>
          <p className="text-xs text-ink-3">Live status of doctors, OPD consultation room assignments, and queue loads.</p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilter('all')}
            className={`min-h-9 px-3 text-xs font-semibold uppercase tracking-wider ${
              filter === 'all' ? 'bg-deep text-surface' : 'border border-rule bg-surface text-ink-2 hover:bg-paper'
            }`}
          >
            All Doctors ({doctors.length})
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`min-h-9 px-3 text-xs font-semibold uppercase tracking-wider ${
              filter === 'active' ? 'bg-deep text-surface' : 'border border-rule bg-surface text-ink-2 hover:bg-paper'
            }`}
          >
            Active In Clinic ({doctors.filter((d) => ['on_duty', 'in_consultation'].includes(d.status)).length})
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((doc) => {
          const isBusy = doc.status === 'in_consultation'
          const isAvailable = doc.status === 'on_duty'
          const isLeave = doc.status === 'on_leave'

          return (
            <div
              key={doc.id}
              className="border-2 border-rule bg-surface p-4 flex flex-col justify-between hover:border-accent transition space-y-3"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-block border border-rule bg-paper px-2 py-0.5 font-mono text-[11px] font-bold text-ink uppercase">
                      {doc.room}
                    </span>
                    <h3 className="font-bold text-ink mt-1 text-sm">{doc.name}</h3>
                    <p className="text-xs text-accent-ink font-semibold">{doc.specialty}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(doc.id)}
                    title="Click to toggle doctor clinical status"
                    className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border cursor-pointer ${
                      isAvailable
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : isBusy
                          ? 'border-amber-600 bg-amber-50 text-amber-900 animate-pulse'
                          : isLeave
                            ? 'border-alert bg-alert/10 text-alert'
                            : 'border-rule bg-paper text-ink-3'
                    }`}
                  >
                    {isAvailable && '● On Duty'}
                    {isBusy && '● In Consultation'}
                    {doc.status === 'ward_rounds' && '● Ward Rounds'}
                    {isLeave && '● On Leave'}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-b border-rule py-2 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-ink-3 uppercase block">Waiting Queue</span>
                    <strong className="text-sm font-bold text-ink">{doc.currentQueueCount} Patients</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-3 uppercase block">Completed Today</span>
                    <strong className="text-sm font-bold text-ink-2">{doc.completedTodayCount} Seen</strong>
                  </div>
                </div>

                <div className="mt-2 text-[11px] text-ink-3 space-y-0.5">
                  <p>Shift: <strong className="text-ink">{doc.shift}</strong> ({doc.timings})</p>
                  <p>Next Open Slot: <strong className="text-accent-ink">{doc.nextAvailableTime}</strong></p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onSelectDoctorForBooking(doc.name)}
                  className="w-full min-h-10 bg-accent text-surface text-xs font-bold uppercase tracking-wider hover:bg-accent-ink flex items-center justify-center gap-1"
                >
                  Book In {doc.room} →
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

