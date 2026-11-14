import React, { useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronRight, Search, X } from '../icons';
import { api } from '../api';
import type { Doctor, Patient, SlotInfo } from '../types';
import { cleanName, fmtDate, initials, todayISO } from '../helpers';

// ─── APPOINTMENT BOOKING MODAL ──────────────────────────────────────────────
const doctorLabel = (d: { name: string; facility?: string }) => (d.facility ? `${cleanName(d.name)} · ${d.facility}` : cleanName(d.name));

export default function AppointmentModal({
  patient: initPatient,
  doctorId: initDoctorId,
  onClose,
  onSaved
}: {
  patient?: Patient;
  /** Pre-select this doctor (e.g. from the roster). */
  doctorId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [patientQ, setPatientQ] = useState(initPatient?.name || '');
  const [patientResults, setPatientResults] = useState<Patient[]>(initPatient ? [initPatient] : []);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(initPatient || null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [form, setForm] = useState({
    date: todayISO(),
    time: '',
    reason: 'Routine Consultation',
    doctorId: initDoctorId || ''
  });
  // The chosen doctor's slots for the chosen date: free ones can be picked, booked and already-passed ones cannot.
  const [slots, setSlots] = useState<SlotInfo[] | null>(null);
  const [nextFree, setNextFree] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.doctors().then(docs => {
      setDoctors(docs);
      if (docs.length > 0) {
        setForm(f => (f.doctorId ? f : { ...f, doctorId: docs[0].id }));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.doctorId || !form.date) return;
    let live = true;
    api.doctorSlots(form.doctorId, form.date)
      .then(r => {
        if (!live) return;
        setSlots(r.slots);
        setNextFree(r.nextFree);
        // Keep the time if it is still free, otherwise move to the first free one.
        setForm(f => (r.slots.some(s => s.time === f.time && s.state === 'free') ? f : { ...f, time: r.nextFree || '' }));
      })
      .catch(() => { if (live) { setSlots([]); setNextFree(null); setForm(f => ({ ...f, time: '' })); } });
    return () => { live = false; };
  }, [form.doctorId, form.date]);

  const searching = patientQ.length > 1 && !selectedPatient;
  const visibleResults = searching || initPatient ? patientResults : [];

  useEffect(() => {
    if (searching) {
      api.patients(patientQ).then(setPatientResults).catch(() => {});
    }
  }, [patientQ, searching]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) {
      return setError('Please search and select a patient record.');
    }
    setBusy(true);
    setError('');
    try {
      await api.createAppointment({
        patientId: selectedPatient.id,
        date: form.date,
        time: form.time,
        reason: form.reason,
        doctorId: form.doctorId
      });
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Failed to book appointment');
    } finally {
      setBusy(false);
    }
  };

  const presetReasons = [
    'Annual Wellness Check-up',
    'Follow-up Consultation',
    'Medication Review',
    'Cold / Flu Symptoms',
    'Blood Pressure Monitoring',
    'Lab Results Consultation'
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Schedule Patient Appointment</h2>
            <p className="muted">Book an arrival slot with an authorized physician.</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form className="form-grid" onSubmit={submit}>
          {/* Patient Selection Field */}
          <div className="span-2">
            <label>Patient File</label>
            {selectedPatient ? (
              <div className="selected-patient">
                <div className="person">
                  <div className="avatar small">{initials(selectedPatient.name)}</div>
                  <div>
                    <b>{selectedPatient.name}</b>
                    <span className="mono">{selectedPatient.patientId} · DOB: {fmtDate(selectedPatient.dob)}</span>
                  </div>
                </div>
                {!initPatient && (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => { setSelectedPatient(null); setPatientQ(''); }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="search" style={{ marginTop: 6 }}>
                  <Search size={16} />
                  <input
                    placeholder="Search patient by name or CareWeave ID…"
                    value={patientQ}
                    onChange={e => setPatientQ(e.target.value)}
                  />
                </div>
                {visibleResults.length > 0 && (
                  <div className="patient-results">
                    {visibleResults.map(p => (
                      <button
                        type="button"
                        key={p.id}
                        className="patient-result"
                        onClick={() => {
                          setSelectedPatient(p);
                          setPatientResults([]);
                        }}
                      >
                        <div className="avatar small">{initials(p.name)}</div>
                        <span>
                          <b>{p.name}</b>
                          <small>{p.patientId} · Born {fmtDate(p.dob)} · {p.phone}</small>
                        </span>
                        <ChevronRight size={16} style={{ color: 'var(--slate-400)' }} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <label>
            Appointment Date
            <input
              required
              type="date"
              value={form.date}
              min={todayISO()}
              onChange={e => setForm({ ...form, date: e.target.value })}
            />
          </label>

          <label>
            Time Slot
            <select
              value={form.time}
              onChange={e => setForm({ ...form, time: e.target.value })}
            >
              {slots === null && <option value="">Loading slots…</option>}
              {slots !== null && !form.time && <option value="">No free slot</option>}
              {(slots ?? []).map(s => (
                <option key={s.time} value={s.time} disabled={s.state !== 'free'}>
                  {s.time}{s.state === 'booked' ? ' · Booked' : s.state === 'past' ? ' · Passed' : ''}
                </option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: 11, fontWeight: 500 }}>
              {slots !== null && !nextFree
                ? 'No free slot on this date with this doctor. Try another date or doctor.'
                : nextFree ? `Next free: ${nextFree}` : ''}
            </span>
          </label>

          <label className="span-2">
            Attending Clinician
            <select
              value={form.doctorId}
              onChange={e => setForm({ ...form, doctorId: e.target.value })}
            >
              {doctors.map(d => (
                <option key={d.id} value={d.id}>{doctorLabel(d)}</option>
              ))}
            </select>
          </label>

          <label className="span-2">
            Reason for Visit
            <input
              required
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              placeholder="e.g. Annual check-up, blood pressure review"
            />
          </label>

          <div className="span-2" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: -6 }}>
            {presetReasons.map(r => (
              <button
                type="button"
                key={r}
                className="btn-secondary small-btn"
                onClick={() => setForm(f => ({ ...f, reason: r }))}
              >
                {r}
              </button>
            ))}
          </div>

          {error && (
            <div className="alert danger span-2">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="modal-actions span-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" disabled={busy || !selectedPatient || !form.time || !form.doctorId}>
              {busy ? 'Booking…' : 'Confirm Appointment Booking'}
              <CalendarDays size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
