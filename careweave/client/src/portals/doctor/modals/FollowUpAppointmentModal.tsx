import React, { useEffect, useState } from 'react';
import { AlertTriangle } from '../icons';
import { api } from '../api';
import type { Patient } from '../types';
import { todayISO } from '../helpers';
import { Modal } from '../components';

export function FollowUpAppointmentModal({ patient, onClose, onSaved }: { patient?: Patient; onClose: () => void; onSaved: () => void }) {
  const [patients, setPatients] = useState<Patient[]>(patient ? [patient] : []);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(patient || null);
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('10:00 AM');
  const [reason, setReason] = useState('Follow-up clinical consultation');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!patient) api.patients().then(setPatients).catch(() => {});
  }, [patient]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return setError('Please select a patient');
    setBusy(true);
    try {
      await api.createAppointment({
        patientId: selectedPatient.id,
        date,
        time,
        reason
      });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Schedule Clinical Appointment" sub="Doctor follow-up booking" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <div className="span-2">
          <label>Patient</label>
          {patient ? (
            <div className="selected-patient">
              <b>{patient.name}</b> <span className="mono">{patient.patientId}</span>
            </div>
          ) : (
            <select
              required
              value={selectedPatient?.id || ''}
              onChange={e => setSelectedPatient(patients.find(p => p.id === e.target.value) || null)}
            >
              <option value="">Select patient…</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.patientId})</option>
              ))}
            </select>
          )}
        </div>

        <label>
          Date
          <input required type="date" value={date} min={todayISO()} onChange={e => setDate(e.target.value)} />
        </label>

        <label>
          Time
          <input required value={time} onChange={e => setTime(e.target.value)} />
        </label>

        <label className="span-2">
          Reason for Visit
          <input required value={reason} onChange={e => setReason(e.target.value)} />
        </label>

        {error && <div className="alert danger span-2"><AlertTriangle size={16} />{error}</div>}

        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>Schedule Appointment</button>
        </div>
      </form>
    </Modal>
  );
}
