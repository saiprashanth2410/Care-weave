import { useEffect, useState, useCallback } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, ClockIcon, RefreshCw, Stethoscope, UserCheck, UserPlus, Users } from '../icons';
import { api } from '../api';
import type { Appointment, Dashboard, User } from '../types';
import { fmtTime, initials, greeting, waitDuration, waitUrgency } from '../helpers';

// ─── RECEPTIONIST: OVERVIEW COMMAND CENTER ──────────────────────────────────
export default function OverviewSection({
  user,
  refresh,
  go,
  notify,
  onRegister,
  onBook,
  onPrintToken
}: {
  user: User;
  refresh: number;
  go: (s: any) => void;
  notify: (s: string) => void;
  onRegister: () => void;
  onBook: () => void;
  onPrintToken?: (a: Appointment, idx?: number) => void;
}) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    setLoading(true);
    api.dashboard()
      .then(d => setData(d))
      .catch(e => notify(e.message))
      .finally(() => setLoading(false));
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData, refresh]);

  if (loading && !data) {
    return (
      <div className="loading-card">
        <RefreshCw className="spin" size={24} style={{ color: 'var(--primary)' }} />
        <span>Loading reception dashboard…</span>
      </div>
    );
  }

  const s = data?.stats || {
    patients: 0,
    appointments: 0,
    waiting: 0,
    checkedIn: 0,
    inConsultation: 0,
    completed: 0,
    cancelled: 0,
    todayCompleted: 0,
    todayScheduled: 0,
  };

  const todayAppts = data?.appointments || [];
  const waitingPatients = todayAppts.filter(a => ['Waiting', 'Checked In', 'Checked in'].includes(a.status));

  const handleQuickCheckIn = async (a: Appointment) => {
    try {
      await api.updateAppointment(a.id, { status: 'Checked In', version: a.version });
      notify(`${a.patientName} checked in. Opening token slip.`);
      onPrintToken?.(a, 1);
      loadData();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const handleCallIn = async (a: Appointment) => {
    try {
      await api.updateAppointment(a.id, { status: 'In Consultation', version: a.version });
      notify(`${a.patientName} called into consultation`);
      loadData();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">COMMAND CENTER</p>
          <h1>{greeting()}, {user.name.split(' ')[0]}.</h1>
          <p className="muted">
            Front desk overview for {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => go('appointments')}>
            <CalendarDays size={16} />
            <span>Full Schedule</span>
          </button>
          <button className="btn-soft" onClick={onBook}>
            <CalendarDays size={16} />
            <span>Book Appointment</span>
          </button>
          <button className="btn-primary" onClick={onRegister}>
            <UserPlus size={16} />
            <span>Register Patient</span>
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon"><Users size={22} /></div>
          <div>
            <span>Registered Patients</span>
            <strong>{s.patients}</strong>
            <small className="positive">Active directory</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue"><CalendarDays size={22} /></div>
          <div>
            <span>Today's Schedule</span>
            <strong>{s.appointments}</strong>
            <small>{s.todayScheduled} awaiting arrival</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon amber"><Clock3 size={22} /></div>
          <div>
            <span>In Waiting Room</span>
            <strong>{s.waiting}</strong>
            <small>{waitingPatients.length > 0 ? 'Active queue' : 'Queue clear'}</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle2 size={22} /></div>
          <div>
            <span>Completed Today</span>
            <strong>{s.todayCompleted || s.completed || 0}</strong>
            <small className="positive">Handled & discharged</small>
          </div>
        </div>
      </div>

      {/* Dashboard Body Grid */}
      <div className="dashboard-grid">
        {/* Left: Today's Schedule */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Today's Appointment Schedule</h3>
              <p className="muted">Real-time schedule for front desk arrivals</p>
            </div>
            <button className="text-button" onClick={() => go('appointments')}>
              View all schedule <ArrowRight size={14} />
            </button>
          </div>

          <div className="list">
            {todayAppts.length === 0 ? (
              <div className="empty">
                <CalendarDays size={32} />
                <b>No appointments scheduled for today</b>
                <span>Click "Book Appointment" to schedule patients.</span>
              </div>
            ) : (
              todayAppts.map(a => (
                <div className="list-row" key={a.id}>
                  <div className="time-block">
                    <b>{a.time}</b>
                    <small>{a.doctorName || 'General Clinic'}</small>
                  </div>
                  <div className="avatar small">{initials(a.patientName)}</div>
                  <div className="row-main">
                    <b>{a.patientName}</b>
                    <span>{a.reason} · ID: {a.patientIdCode || '—'}</span>
                  </div>
                  <span className={`status ${a.status.toLowerCase().replace(/\s+/g, '-')}`}>
                    {a.status}
                  </span>
                  <div className="row-actions">
                    {a.status === 'Scheduled' && (
                      <button
                        className="btn-soft small-btn"
                        onClick={() => handleQuickCheckIn(a)}
                        title="Check patient in"
                      >
                        <UserCheck size={13} />
                        <span>Check In</span>
                      </button>
                    )}
                    {['Checked In', 'Waiting', 'Checked in'].includes(a.status) && (
                      <>
                        <button
                          className="btn-secondary small-btn"
                          onClick={() => onPrintToken?.(a)}
                          title="Print OPD Thermal Token Slip"
                        >
                          <span>🖨️ Token</span>
                        </button>
                        <button
                          className="btn-primary small-btn"
                          onClick={() => handleCallIn(a)}
                          title="Send patient into consultation"
                        >
                          <Stethoscope size={13} />
                          <span>Call In</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Waiting Room Snapshot & Recent Activity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Waiting Room Snapshot */}
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Active Waiting Room</h3>
                <p className="muted">{waitingPatients.length} patient{waitingPatients.length !== 1 ? 's' : ''} currently waiting</p>
              </div>
              <button className="text-button" onClick={() => go('queue')}>
                Open queue <ArrowRight size={14} />
              </button>
            </div>

            {waitingPatients.length === 0 ? (
              <div className="empty" style={{ padding: '24px 0' }}>
                <ClockIcon size={26} />
                <b>Waiting room is currently clear</b>
                <span>Checked-in patients will appear here automatically.</span>
              </div>
            ) : (
              <div className="list">
                {waitingPatients.slice(0, 4).map((a, i) => (
                  <div className="queue-row" key={a.id}>
                    <span className="queue-number">#{String(i + 1).padStart(2, '0')}</span>
                    <div className="avatar small">{initials(a.patientName)}</div>
                    <div className="row-main">
                      <b>{a.patientName}</b>
                      <span>{a.doctorName || 'Dr. Assigned'}</span>
                      <span className={`wait-chip ${waitUrgency(a.checkedInAt)}`}>
                        <ClockIcon size={11} /> {waitDuration(a.checkedInAt)}
                      </span>
                    </div>
                    <button
                      className="btn-soft small-btn"
                      onClick={() => handleCallIn(a)}
                    >
                      Call In
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Front Desk Activity Log */}
          <div className="card">
            <div className="card-head" style={{ marginBottom: 12 }}>
              <div>
                <h3>Front Desk Activity Log</h3>
                <p className="muted">Recent administrative actions & check-ins</p>
              </div>
            </div>

            <div className="recent-activity">
              {(data?.recent || []).slice(0, 5).map(r => (
                <div className="activity-row" key={r.id}>
                  <div className={`activity-dot ${r.action}`} />
                  <div>
                    <b>{r.action.toUpperCase()} · {r.entity}</b>
                    <small>{r.detail || 'Reception event'} · {fmtTime(r.timestamp)}</small>
                  </div>
                </div>
              ))}
              {(!data?.recent || data.recent.length === 0) && (
                <p className="muted" style={{ fontSize: 12, padding: '12px 0', textAlign: 'center' }}>
                  No recent front desk actions logged.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
