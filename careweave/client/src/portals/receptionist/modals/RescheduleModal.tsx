import React, { useState } from 'react';
import { AlertTriangle, Calendar, X } from '../icons';
import { api } from '../api';
import type { Appointment } from '../types';
import { todayISO } from '../helpers';

// ─── RESCHEDULE APPOINTMENT MODAL ──────────────────────────────────────────
export default function RescheduleModal({
  appointment,
  onClose,
  onSaved
}: {
  appointment: Appointment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(
    appointment.date === 'Today' || appointment.date === 'Tomorrow' ? todayISO() : appointment.date
  );
  const [time, setTime] = useState(appointment.time);
  const [reason, setReason] = useState(appointment.reason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const timeSlots = [
    '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
    '11:00 AM', '11:30 AM', '12:00 PM', '01:30 PM', '02:00 PM',
    '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM'
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.updateAppointment(appointment.id, { date, time, reason, version: appointment.version });
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Failed to reschedule appointment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Reschedule Appointment</h2>
            <p className="muted">{appointment.patientName} · {appointment.patientIdCode}</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form className="form-grid" onSubmit={submit}>
          <label>
            New Date
            <input
              required
              type="date"
              value={date}
              min={todayISO()}
              onChange={e => setDate(e.target.value)}
            />
          </label>

          <label>
            New Time Slot
            <select value={time} onChange={e => setTime(e.target.value)}>
              {timeSlots.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          <label className="span-2">
            Visit Reason
            <input value={reason} onChange={e => setReason(e.target.value)} />
          </label>

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
            <button className="btn-primary" disabled={busy}>
              {busy ? 'Updating…' : 'Save New Schedule'}
              <Calendar size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
