import React, { useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronRight, Search, X } from '../icons';
import { api } from '../api';
import type { Doctor, Patient } from '../types';
import { fmtDate, initials, todayISO } from '../helpers';

// ─── APPOINTMENT BOOKING MODAL ──────────────────────────────────────────────
export default function AppointmentModal({
  patient: initPatient,
  onClose,
  onSaved
}: {
  patient?: Patient;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [patientQ, setPatientQ] = useState(initPatient?.name || '');
  const [patientResults, setPatientResults] = useState<Patient[]>(initPatient ? [initPatient] : []);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(initPatient || null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [form, setForm] = useState({
    date: todayISO(),
    time: '10:00 AM',
    reason: 'Routine Consultation',
    doctorId: ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.doctors().then(docs => {
      setDoctors(docs);
      if (docs.length > 0 && !form.doctorId) {
        setForm(f => ({ ...f, doctorId: docs[0].id }));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (patientQ.length > 1 && !selectedPatient) {
      api.patients(patientQ).then(setPatientResults).catch(() => {});
    } else if (!initPatient) {
      setPatientResults([]);
    }
  }, [patientQ, selectedPatient, initPatient]);

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

  const timeSlots = [
    '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
    '11:00 AM', '11:30 AM', '12:00 PM', '01:30 PM', '02:00 PM',
    '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM'
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
                {patientResults.length > 0 && (
                  <div className="patient-results">
                    {patientResults.map(p => (
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
              {timeSlots.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          <label className="span-2">
            Attending Clinician
            <select
              value={form.doctorId}
              onChange={e => setForm({ ...form, doctorId: e.target.value })}
            >
              {doctors.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.facility})</option>
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
            <button className="btn-primary" disabled={busy || !selectedPatient}>
              {busy ? 'Booking…' : 'Confirm Appointment Booking'}
              <CalendarDays size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
