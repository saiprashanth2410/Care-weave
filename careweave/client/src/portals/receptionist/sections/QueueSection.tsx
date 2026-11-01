import { useEffect, useState, useCallback, useMemo } from 'react';
import { Ban, Check, CheckCircle2, Clock3, ClockIcon, Plus, RefreshCw, Stethoscope, UserCheck } from '../icons';
import { api } from '../api';
import type { Appointment } from '../types';
import { getDoctorRoom, fmtTime, initials, waitDuration, waitUrgency } from '../helpers';

// ─── RECEPTIONIST: LIVE PATIENT QUEUE (WAITING ROOM MANAGER) ────────────────
export default function QueueSection({
  refresh,
  notify,
  onBook,
  onPrintToken
}: {
  refresh: number;
  notify: (s: string) => void;
  onBook: () => void;
  onPrintToken: (a: Appointment, idx: number) => void;
}) {
  const [items, setItems] = useState<Appointment[]>([]);
  const [tick, setTick] = useState(0);

  const load = useCallback(() => {
    api.appointments({ date: 'today' })
      .then(setItems)
      .catch(e => notify(e.message));
  }, [notify]);

  useEffect(() => {
    load();
  }, [load, refresh]);

  // Live timer tick every 15s to update wait durations dynamically
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const waitingQueue = useMemo(() => {
    return items
      .filter(a => ['Checked In', 'Waiting', 'Checked in'].includes(a.status))
      .sort((a, b) => {
        const ta = a.checkedInAt ? new Date(a.checkedInAt).getTime() : 0;
        const tb = b.checkedInAt ? new Date(b.checkedInAt).getTime() : 0;
        return ta - tb;
      });
  }, [items, tick]);

  const inConsultation = useMemo(() => {
    return items.filter(a => a.status === 'In Consultation');
  }, [items]);

  const scheduledToday = useMemo(() => {
    return items.filter(a => a.status === 'Scheduled');
  }, [items]);

  const handleStatusChange = async (a: Appointment, status: string) => {
    try {
      await api.updateAppointment(a.id, { status, version: a.version });
      notify(`${a.patientName} status updated to "${status}"`);
      load();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">WAITING ROOM & PATIENT FLOW</p>
          <h1>Live Patient Queue</h1>
          <p className="muted">
            Manage arrivals, track wait durations, and send patients into consultation rooms.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={load}>
            <RefreshCw size={15} />
            <span>Refresh Queue</span>
          </button>
          <button className="btn-primary" onClick={onBook}>
            <Plus size={16} />
            <span>Add Walk-in Appointment</span>
          </button>
        </div>
      </div>

      <div className="queue-layout">
        {/* Main Queue Column */}
        <div className="card queue-main">
          <div className="queue-count">
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <strong>{waitingQueue.length}</strong>
              <span>patients currently waiting in lobby</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="live-badge">
                <span className="pulse"></span> Live wait monitoring
              </span>
            </div>
          </div>

          {waitingQueue.length === 0 ? (
            <div className="empty" style={{ padding: '60px 20px' }}>
              <ClockIcon size={36} />
              <b>No patients currently in the waiting room</b>
              <span>Check in scheduled patients from the right column as they arrive.</span>
            </div>
          ) : (
            <div className="list">
              {waitingQueue.map((a, i) => {
                const urgency = waitUrgency(a.checkedInAt);
                return (
                  <div className="queue-row" key={a.id}>
                    <span className="queue-number">#{String(i + 1).padStart(2, '0')}</span>
                    <span className="mono" style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                      {getDoctorRoom(a.doctorName)}
                    </span>
                    <div className="avatar">{initials(a.patientName)}</div>
                    <div className="row-main">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <b>{a.patientName}</b>
                        <span className="mono">{a.patientIdCode || ''}</span>
                      </div>
                      <span>
                        Assigned to: <strong>{a.doctorName || 'Dr. Amara Singh'}</strong> · Reason: {a.reason}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span className={`wait-chip ${urgency}`}>
                          <ClockIcon size={12} /> {waitDuration(a.checkedInAt)} elapsed
                        </span>
                        <small className="muted">Arrived at {fmtTime(a.checkedInAt)}</small>
                      </div>
                    </div>

                    <span className={`status ${a.status.toLowerCase().replace(/\s+/g, '-')}`}>
                      {a.status}
                    </span>

                    <div className="row-actions">
                      <button
                        className="btn-secondary small-btn"
                        onClick={() => onPrintToken(a, i + 1)}
                        title="Print OPD Thermal Token & Wristband Slip"
                      >
                        <span>🖨️ Slip</span>
                      </button>

                      <button
                        className="btn-primary small-btn"
                        onClick={() => handleStatusChange(a, 'In Consultation')}
                        title="Send patient into doctor's consultation room"
                      >
                        <Stethoscope size={13} />
                        <span>Call In</span>
                      </button>

                      {a.status === 'Checked In' && (
                        <button
                          className="btn-secondary small-btn"
                          onClick={() => handleStatusChange(a, 'Waiting')}
                          title="Mark as actively waiting"
                        >
                          <Clock3 size={13} />
                          <span>Waiting</span>
                        </button>
                      )}

                      <button
                        className="btn-danger-soft small-btn"
                        onClick={() => {
                          if (window.confirm(`Mark ${a.patientName} as No Show?`)) {
                            handleStatusChange(a, 'No Show');
                          }
                        }}
                        title="Patient not present"
                      >
                        <Ban size={12} />
                        <span>No Show</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Flow Column: Rooms in consultation & Scheduled arrivals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Active Consultations */}
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Currently with Doctor</h3>
                <p className="muted">{inConsultation.length} consultation{inConsultation.length !== 1 ? 's' : ''} in progress</p>
              </div>
            </div>

            {inConsultation.length === 0 ? (
              <p className="muted" style={{ fontSize: 12, padding: '12px 0' }}>
                No active doctor consultations at this moment.
              </p>
            ) : (
              <div className="list">
                {inConsultation.map(a => (
                  <div className="list-row" key={a.id}>
                    <div className="avatar small">{initials(a.patientName)}</div>
                    <div className="row-main">
                      <b>{a.patientName}</b>
                      <span>{a.doctorName || 'Doctor'} · {a.reason}</span>
                    </div>
                    <button
                      className="btn-soft small-btn"
                      onClick={() => handleStatusChange(a, 'Completed')}
                      title="Discharge patient / check out"
                    >
                      <CheckCircle2 size={13} />
                      <span>Check Out</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Arrivals Today */}
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Scheduled Arrivals Today</h3>
                <p className="muted">{scheduledToday.length} appointment{scheduledToday.length !== 1 ? 's' : ''} pending arrival</p>
              </div>
            </div>

            {scheduledToday.length === 0 ? (
              <p className="muted" style={{ fontSize: 12, padding: '12px 0' }}>
                All scheduled patients have either arrived or concluded.
              </p>
            ) : (
              <div className="list">
                {scheduledToday.slice(0, 5).map(a => (
                  <div className="list-row" key={a.id}>
                    <div className="time-block" style={{ minWidth: 65 }}>
                      <b>{a.time}</b>
                    </div>
                    <div className="row-main">
                      <b>{a.patientName}</b>
                      <span>{a.reason}</span>
                    </div>
                    <button
                      className="btn-soft small-btn"
                      onClick={() => handleStatusChange(a, 'Checked In')}
                    >
                      <UserCheck size={13} />
                      <span>Check In</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Front Desk Protocols */}
          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--navy-900)' }}>Front Desk Protocols</h3>
            <div className="check-list">
              <div><Check size={16} /> Verify photo ID and phone number upon arrival</div>
              <div><Check size={16} /> Check patient in to start waiting room timer</div>
              <div><Check size={16} /> Call in patient when clinician room is ready</div>
              <div><Check size={16} /> Process check-out after encounter concludes</div>
              <div><Check size={16} /> Mark no-shows after 20 minutes grace period</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
