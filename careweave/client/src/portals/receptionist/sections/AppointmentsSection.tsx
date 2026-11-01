import { useEffect, useState, useCallback, useMemo } from 'react';
import { Ban, CalendarDays, CheckCircle2, Pencil, Plus, RefreshCw, Search, Stethoscope, UserCheck, X } from '../icons';
import { api } from '../api';
import type { Appointment, Doctor } from '../types';
import { fmtTime, initials } from '../helpers';
import RescheduleModal from '../modals/RescheduleModal';

// ─── RECEPTIONIST: APPOINTMENTS SCHEDULER ────────────────────────────────────
export default function AppointmentsSection({
  refresh,
  notify,
  onNewAppointment
}: {
  refresh: number;
  notify: (s: string) => void;
  onNewAppointment: () => void;
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [q, setQ] = useState('');
  const [dateFilter, setDateFilter] = useState<'today' | 'all'>('today');
  const [statusFilter, setStatusFilter] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null);

  const loadDoctors = useCallback(() => {
    api.doctors().then(setDoctors).catch(() => {});
  }, []);

  const loadAppointments = useCallback(() => {
    const params: any = {};
    if (dateFilter === 'today') params.date = 'today';
    if (statusFilter) params.status = statusFilter;
    api.appointments(params)
      .then(setAppointments)
      .catch(e => notify(e.message));
  }, [dateFilter, statusFilter, notify]);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments, refresh]);

  const handleStatus = async (a: Appointment, status: string) => {
    try {
      await api.updateAppointment(a.id, { status, version: a.version });
      notify(`Appointment marked as "${status}"`);
      loadAppointments();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const filtered = useMemo(() => {
    return appointments.filter(a => {
      if (doctorFilter && a.doctorId !== doctorFilter) return false;
      if (!q) return true;
      const query = q.toLowerCase();
      return (
        a.patientName.toLowerCase().includes(query) ||
        (a.patientIdCode && a.patientIdCode.toLowerCase().includes(query)) ||
        a.reason.toLowerCase().includes(query) ||
        (a.doctorName && a.doctorName.toLowerCase().includes(query))
      );
    });
  }, [appointments, q, doctorFilter]);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">CARE SCHEDULING</p>
          <h1>Appointments</h1>
          <p className="muted">Book, manage, reschedule, and verify patient bookings.</p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={onNewAppointment}>
            <Plus size={16} />
            <span>New Appointment</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="toolbar">
        <div className="toolbar-row">
          <div className="search">
            <Search size={16} />
            <input
              placeholder="Search by patient name, ID, or reason…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            {q && (
              <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => setQ('')}>
                <X size={14} />
              </button>
            )}
          </div>

          <div className="filter-tabs">
            <button
              className={dateFilter === 'today' ? 'active' : ''}
              onClick={() => setDateFilter('today')}
            >
              Today's Schedule
            </button>
            <button
              className={dateFilter === 'all' ? 'active' : ''}
              onClick={() => setDateFilter('all')}
            >
              All Dates
            </button>
          </div>
        </div>

        <div className="filter-row">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {['Scheduled', 'Checked In', 'Waiting', 'In Consultation', 'Completed', 'Cancelled', 'No Show'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select value={doctorFilter} onChange={e => setDoctorFilter(e.target.value)}>
            <option value="">All Clinicians</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          <button className="icon-btn" onClick={loadAppointments} title="Refresh list">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Appointments Table Card */}
      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Patient</th>
              <th>Reason for Visit</th>
              <th>Clinician</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id}>
                <td>
                  <b>{a.time}</b>
                  <small>{a.date}</small>
                </td>
                <td>
                  <div className="person">
                    <div className="avatar small">{initials(a.patientName)}</div>
                    <div>
                      <b>{a.patientName}</b>
                      <span className="mono">{a.patientIdCode || '—'}</span>
                    </div>
                  </div>
                </td>
                <td>{a.reason}</td>
                <td>{a.doctorName || 'Unassigned'}</td>
                <td>
                  <span className={`status ${a.status.toLowerCase().replace(/\s+/g, '-')}`}>
                    {a.status}
                  </span>
                  {a.checkedInAt && (
                    <small style={{ display: 'block', color: 'var(--slate-400)', fontSize: 10, marginTop: 2 }}>
                      In: {fmtTime(a.checkedInAt)}
                    </small>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                    {a.status === 'Scheduled' && (
                      <>
                        <button
                          className="btn-soft small-btn"
                          onClick={() => handleStatus(a, 'Checked In')}
                          title="Check in patient"
                        >
                          <UserCheck size={13} />
                          <span>Check In</span>
                        </button>

                        <button
                          className="icon-btn"
                          onClick={() => setRescheduleAppt(a)}
                          title="Reschedule appointment"
                        >
                          <Pencil size={14} />
                        </button>

                        <button
                          className="icon-btn danger-icon"
                          onClick={() => {
                            if (window.confirm(`Cancel appointment for ${a.patientName}?`)) {
                              handleStatus(a, 'Cancelled');
                            }
                          }}
                          title="Cancel appointment"
                        >
                          <Ban size={14} />
                        </button>
                      </>
                    )}

                    {['Checked In', 'Waiting', 'Checked in'].includes(a.status) && (
                      <>
                        <button
                          className="btn-primary small-btn"
                          onClick={() => handleStatus(a, 'In Consultation')}
                          title="Send to doctor"
                        >
                          <Stethoscope size={13} />
                          <span>Call In</span>
                        </button>
                        <button
                          className="btn-soft small-btn"
                          onClick={() => handleStatus(a, 'Completed')}
                          title="Complete and discharge"
                        >
                          <span>Discharge</span>
                        </button>
                      </>
                    )}

                    {a.status === 'In Consultation' && (
                      <button
                        className="btn-soft small-btn"
                        onClick={() => handleStatus(a, 'Completed')}
                      >
                        <CheckCircle2 size={13} />
                        <span>Complete</span>
                      </button>
                    )}

                    {['Completed', 'Cancelled', 'No Show'].includes(a.status) && (
                      <span className="mono" style={{ fontSize: 11, color: 'var(--slate-400)' }}>
                        Archived
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="empty">
            <CalendarDays size={32} />
            <b>No appointments match your filters</b>
            <span>Try adjusting your search criteria or book a new appointment.</span>
          </div>
        )}
      </div>

      {rescheduleAppt && (
        <RescheduleModal
          appointment={rescheduleAppt}
          onClose={() => setRescheduleAppt(null)}
          onSaved={() => {
            setRescheduleAppt(null);
            notify('Appointment successfully rescheduled');
            loadAppointments();
          }}
        />
      )}
    </>
  );
}
