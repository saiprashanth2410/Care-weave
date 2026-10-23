import { useEffect, useState, useCallback } from 'react';
import { CalendarDays, Plus, Search, Stethoscope, Calendar, CheckCircle2, ClockIcon } from '../icons';
import { api } from '../api';
import type { Appointment, Patient, User } from '../types';
import { initials, waitDuration } from '../helpers';
import { PageHeader, StatusBadge } from '../components';
import { FollowUpAppointmentModal } from '../modals/FollowUpAppointmentModal';

export function DoctorAppointments({
  user: _user,
  notify,
  onOpenPatient,
  onStartConsultation,
  onScheduleFollowUp
}: {
  user: User;
  notify: (s: string) => void;
  onOpenPatient: (p: Patient) => void;
  onStartConsultation: (p: Patient) => void;
  onScheduleFollowUp: (p: Patient) => void;
}) {
  const [items, setItems] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filter, setFilter] = useState<{ date: string; status: string }>({ date: '', status: '' });
  const [q, setQ] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  const load = useCallback(() => {
    const params: any = {};
    if (filter.date === 'today') params.date = 'today';
    if (filter.status) params.status = filter.status;
    api.appointments(params).then(setItems).catch(e => notify(e.message));
    api.patients().then(setPatients).catch(() => {});
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleStatus = async (a: Appointment, status: string) => {
    try {
      await api.updateAppointment(a.id, { status });
      notify(`Appointment marked ${status}`);
      load();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const shown = q
    ? items.filter(a => [a.patientName, a.patientIdCode, a.reason].some(v => String(v || '').toLowerCase().includes(q.toLowerCase())))
    : items;

  return (
    <>
      <PageHeader
        eyebrow="Clinical Schedule & Queue"
        title="Physician Appointments"
        sub="Manage consultation schedule, patient waiting queue, and start clinical encounters."
        action={
          <button className="primary" onClick={() => setShowScheduleModal(true)}>
            <Plus size={17} /> Schedule Clinical Follow-up
          </button>
        }
      />

      <div className="toolbar toolbar-row">
        <div className="search">
          <Search size={17} />
          <input
            placeholder="Search patient name, ID, or clinical reason"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <div className="filter-row">
          <select value={filter.date} onChange={e => setFilter(f => ({ ...f, date: e.target.value }))}>
            <option value="">All Dates</option>
            <option value="today">Today's Queue Only</option>
          </select>
          <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
            <option value="">All Statuses</option>
            {['Scheduled', 'Checked In', 'Waiting', 'In Consultation', 'Completed', 'Cancelled', 'No Show'].map(s => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Date · Time</th>
              <th>Patient</th>
              <th>Reason for Visit</th>
              <th>Current Status</th>
              <th>Waiting Time</th>
              <th>Clinical Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(a => {
              const p = patients.find(pt => pt.id === a.patientId || pt.patientId === a.patientIdCode);
              return (
                <tr key={a.id}>
                  <td>
                    <b>{a.time}</b>
                    <small className="block">{a.date}</small>
                  </td>
                  <td>
                    <div className="person">
                      <div className="avatar small">{initials(a.patientName)}</div>
                      <div>
                        <b>{a.patientName}</b>
                        <small className="mono">{a.patientIdCode}</small>
                      </div>
                    </div>
                  </td>
                  <td>{a.reason}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td>
                    {a.checkedInAt ? (
                      <span className="wait-chip"><ClockIcon size={11} /> {waitDuration(a.checkedInAt)}</span>
                    ) : '—'}
                  </td>
                  <td>
                    <div className="row-actions">
                      {['Waiting', 'Checked In', 'Checked in'].includes(a.status) && (
                        <button
                          className="primary small-btn"
                          onClick={async () => {
                            await handleStatus(a, 'In Consultation');
                            if (p) onStartConsultation(p);
                          }}
                        >
                          <Stethoscope size={13} /> Call In
                        </button>
                      )}

                      {a.status === 'In Consultation' && (
                        <button
                          className="secondary small-btn"
                          style={{ background: '#f6f7f3', color: '#56655f' }}
                          onClick={() => handleStatus(a, 'Completed')}
                        >
                          <CheckCircle2 size={13} /> Complete
                        </button>
                      )}

                      {p && (
                        <button
                          className="secondary small-btn"
                          onClick={() => onOpenPatient(p)}
                          title="Open Comprehensive EHR"
                        >
                          Open EHR
                        </button>
                      )}

                      {a.status === 'Completed' && p && (
                        <button
                          className="secondary small-btn"
                          onClick={() => onScheduleFollowUp(p)}
                          title="Book follow-up"
                        >
                          <Calendar size={13} /> Follow-up
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && (
          <div className="empty">
            <CalendarDays size={28} />
            <b>No appointments matching filter criteria</b>
            <span>Adjust your search or schedule a new patient appointment.</span>
          </div>
        )}
      </div>

      {showScheduleModal && (
        <FollowUpAppointmentModal
          onClose={() => setShowScheduleModal(false)}
          onSaved={() => {
            setShowScheduleModal(false);
            notify('Appointment scheduled successfully');
            load();
          }}
        />
      )}
    </>
  );
}
