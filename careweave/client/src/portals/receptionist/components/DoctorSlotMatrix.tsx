import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import Loader from './Loader'
import type { DayAppt, Doctor, DoctorDay, RosterDoctor } from '../types'
import { cleanName, fmtTime, hhmmLabel, todayISO } from '../helpers'

type Filter = 'all' | 'in_consultation' | 'available'

const STATUS_LABEL: Record<RosterDoctor['status'], string> = {
  in_consultation: '● In Consultation',
  available: '● Available',
  off_shift: '● Off Shift',
}

/** Minutes between two ISO timestamps, as "12 min"; empty when either is missing. */
const lasted = (from?: string, to?: string) => {
  if (!from || !to) return ''
  const m = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000))
  return `${m} min`
}

function Section({ title, rows, empty, extra }: { title: string; rows: DayAppt[]; empty: string; extra?: (a: DayAppt) => string }) {
  return (
  <section className="mt-5">
    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3">{title} ({rows.length})</h3>
    {rows.length === 0 ? (
      <p className="mt-1 text-xs text-ink-3">{empty}</p>
    ) : (
      <ul className="mt-2 divide-y divide-rule border border-rule bg-surface">
        {rows.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
            <span>
              <b className="text-ink">{a.patientName}</b>
              <span className="ml-2 font-mono text-ink-3">{a.patientIdCode || ''}</span>
              {a.reason && <span className="block text-ink-3">{a.reason}</span>}
            </span>
            <span className="whitespace-nowrap text-right font-mono text-ink-2">
              {a.token && <span className="block font-bold text-ink">{a.token}</span>}
              {extra ? extra(a) : a.time}
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
  )
}

// ─── One doctor's day: who is with them, who waits, who they have seen ──────
function DoctorDayDrawer({ doctor, refresh, onClose }: { doctor: Doctor; refresh: number; onClose: () => void }) {
  const [date, setDate] = useState(todayISO())
  const [day, setDay] = useState<DoctorDay | null>(null)
  const [failed, setFailed] = useState('')

  useEffect(() => {
    let live = true
    api.doctorDay(doctor.id, date)
      .then((d) => { if (live) { setDay(d); setFailed('') } })
      .catch((e) => { if (live) setFailed(e.message || 'Could not load this doctor\'s day') })
    return () => { live = false }
  }, [doctor.id, date, refresh])

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
        <p className="text-xs font-bold uppercase tracking-wider text-accent-ink">Doctor&apos;s day</p>
        <h2 className="mt-1 text-xl font-bold text-ink">{cleanName(doctor.name)}</h2>
        <p className="text-xs text-ink-3">
          {[doctor.facility, doctor.room, doctor.shiftStart && doctor.shiftEnd ? `${hhmmLabel(doctor.shiftStart)} to ${hhmmLabel(doctor.shiftEnd)}` : ''].filter(Boolean).join(' · ')}
        </p>
        <label className="mt-4 block text-xs font-semibold text-ink-2">
          Day
          <input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} className="ml-2" />
        </label>

        {failed && <p className="mt-3 text-xs text-alert">{failed}</p>}
        {!day && !failed && <p className="mt-3 text-xs text-ink-3">Loading…</p>}
        {day && (
          <>
            <Section title="With the doctor now" rows={day.current} empty="Nobody is in the consultation room." extra={(a) => `since ${fmtTime(a.startedAt)}`} />
            <Section title="Waiting" rows={day.waiting} empty="Nobody is waiting for this doctor." extra={(a) => `in at ${fmtTime(a.checkedInAt)}`} />
            <Section title="Coming up" rows={day.upcoming} empty="No more scheduled arrivals." />
            <Section
              title="Seen"
              rows={day.seen}
              empty="No patients seen yet."
              extra={(a) => [fmtTime(a.startedAt), '→', fmtTime(a.completedAt), lasted(a.startedAt, a.completedAt) && `(${lasted(a.startedAt, a.completedAt)})`].filter(Boolean).join(' ')}
            />
            {day.notSeen.length > 0 && <Section title="Cancelled / no-show" rows={day.notSeen} empty="" extra={(a) => `${a.time} · ${a.status}`} />}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Doctor roster: real doctors, real queues ──────────────────────────────
export default function DoctorSlotMatrix({
  refresh,
  notify,
  onBook,
}: {
  refresh: number
  notify: (s: string) => void
  onBook: (doctor: Doctor) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [roster, setRoster] = useState<RosterDoctor[] | null>(null)
  const [open, setOpen] = useState<Doctor | null>(null)

  const load = useCallback(() => {
    api.roster().then(setRoster).catch((e) => notify(e.message))
  }, [notify])

  useEffect(() => { load() }, [load, refresh])
  // Time moves on even when nothing else changes: next-free slots and shifts are measured against the clock.
  useEffect(() => {
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const all = roster ?? []
  const shown = all.filter((d) => filter === 'all' || d.status === filter)
  const inRoom = all.filter((d) => d.status === 'in_consultation').length
  const chip = (id: Filter, label: string) => (
    <button onClick={() => setFilter(id)} className={filter === id ? 'btn-primary' : 'btn-soft'}>
      {label}
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-accent-ink">Doctor roster</span>
          <h2 className="text-lg font-bold text-ink">Live availability &amp; queues</h2>
          <p className="text-xs text-ink-3">Every doctor on the staff list, with who is in the room, who waits and who has been seen today. Click a name for their day.</p>
        </div>
        <div className="flex gap-1.5">
          {chip('all', roster ? `All doctors (${all.length})` : 'All doctors')}
          {chip('in_consultation', roster ? `In consultation (${inRoom})` : 'In consultation')}
          {chip('available', roster ? `Available (${all.filter((d) => d.status === 'available').length})` : 'Available')}
        </div>
      </div>

      {roster === null && <Loader label="Loading doctors…" />}
      {roster !== null && all.length === 0 && (
        <p className="border border-rule bg-paper p-4 text-sm text-ink-2">No doctors yet. An administrator adds them under Staff &amp; Access, and they appear here at once.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((doc) => {
          const busy = doc.status === 'in_consultation'
          return (
            <div key={doc.id} className={`flex flex-col justify-between space-y-3 border-2 bg-surface p-4 transition hover:border-accent ${busy ? 'border-amber-600' : 'border-rule'}`}>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {doc.room && (
                      <span className="inline-block border border-rule bg-paper px-2 py-0.5 font-mono text-[11px] font-bold uppercase text-ink">{doc.room}</span>
                    )}
                    <h3 className="mt-1 text-sm font-bold">
                      <button type="button" onClick={() => setOpen(doc)} className="text-left text-ink underline decoration-dotted underline-offset-2 hover:text-accent-ink" title="See this doctor's patients">
                        {cleanName(doc.name)}
                      </button>
                    </h3>
                    <p className="text-xs font-semibold text-accent-ink">{doc.facility}</p>
                  </div>
                  <span
                    className={`border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      doc.status === 'available'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : busy
                          ? 'animate-pulse border-amber-600 bg-amber-50 text-amber-900'
                          : 'border-rule bg-paper text-ink-3'
                    }`}
                  >
                    {STATUS_LABEL[doc.status]}
                  </span>
                </div>

                {busy && doc.current && (
                  <p className="mt-2 border border-amber-600/40 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                    With <b>{doc.current.patientName}</b> since {fmtTime(doc.current.startedAt)}
                  </p>
                )}

                <div className="mt-3 grid grid-cols-3 gap-2 border-b border-t border-rule py-2 font-mono text-xs">
                  <div>
                    <span className="block text-[10px] uppercase text-ink-3">Waiting</span>
                    <strong className="text-sm font-bold text-ink">{doc.waiting}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-ink-3">Seen today</span>
                    <strong className="text-sm font-bold text-ink-2">{doc.seen}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-ink-3">Booked ahead</span>
                    <strong className="text-sm font-bold text-ink-2">{doc.scheduled}</strong>
                  </div>
                </div>

                <div className="mt-2 space-y-0.5 text-[11px] text-ink-3">
                  <p>Hours: <strong className="text-ink">{hhmmLabel(doc.shiftStart)} to {hhmmLabel(doc.shiftEnd)}</strong></p>
                  <p>
                    Next open slot:{' '}
                    <strong className="text-accent-ink">{doc.nextOpenSlot ? `${doc.nextOpenSlot} (${doc.freeSlots} free today)` : 'none left today'}</strong>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button type="button" onClick={() => setOpen(doc)} className="btn-soft">
                  Patients
                </button>
                <button type="button" onClick={() => onBook(doc)} className="btn-primary">
                  Book →
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {open && <DoctorDayDrawer doctor={open} refresh={refresh} onClose={() => setOpen(null)} />}
    </div>
  )
}
