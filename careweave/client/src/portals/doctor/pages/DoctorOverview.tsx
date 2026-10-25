import { useEffect, useState } from 'react';
import { Activity, ArrowRight, CalendarDays, ChevronRight, Clock3, FlaskConical, RefreshCw, Search, Stethoscope, CheckCircle2 } from '../icons';
import { api } from '../api';
import type { Dashboard, Patient, User } from '../types';
import { fmtDate, initials, waitDuration } from '../helpers';
import { PageHeader, StatCard, StatusBadge, Loading } from '../components';

export function DoctorOverview({
  user,
  refresh,
  go,
  notify,
  onOpenPatient,
  onStartConsultation
}: {
  user: User;
  refresh: number;
  go: (s: string) => void;
  notify: (s: string) => void;
  onOpenPatient: (p: Patient) => void;
  onStartConsultation: (p: Patient) => void;
  onOrderLab: (p: Patient) => void;
  onPrescribe: (p: Patient) => void;
}) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [allPatients, setAllPatients] = useState<Patient[]>([]);

  useEffect(() => {
    api.dashboard().then(setData).catch(e => notify(e.message));
    api.patients().then(setAllPatients).catch(() => {});
  }, [refresh]);

  if (!data) return <Loading />;
  const s = data.stats;
  const todayAppts = data.appointments;
  const waitingPatients = todayAppts.filter(a => ['Waiting', 'Checked In', 'Checked in'].includes(a.status));
  const inConsultation = todayAppts.filter(a => a.status === 'In Consultation');

  return (
    <>
      <PageHeader
        title={`Good day, ${user.name}.`}
        sub="Today's patients, results waiting for review and records to reconcile."
        action={
          <div className="header-actions">
            <button className="secondary" onClick={() => go('records')}>
              <Search size={16} /> Search Patient EHR
            </button>
            <button className="primary" onClick={() => go('consultations')}>
              <Stethoscope size={16} /> New Clinical Encounter
            </button>
          </div>
        }
      />

      <div className="stat-grid">
        <StatCard
          label="Today's Patient Schedule"
          value={todayAppts.length}
          icon={<CalendarDays size={20} />}
          tone="teal"
          delta={`${todayAppts.filter(a => a.status === 'Completed').length} completed`}
        />
        <StatCard
          label="Patients Waiting / In Clinic"
          value={waitingPatients.length + inConsultation.length}
          icon={<Clock3 size={20} />}
          tone="amber"
          delta={inConsultation.length > 0 ? `${inConsultation.length} in exam room` : 'Ready for consult'}
        />
        <StatCard
          label="Diagnostic Results to Review"
          value={s.released || data.labOrders.filter(l => l.status === 'Released to Doctor').length}
          icon={<FlaskConical size={20} />}
          tone="blue"
          delta="Verified by lab"
        />
        <StatCard
          label="Reconciliation Cases"
          value={data.cases.length}
          icon={<RefreshCw size={20} />}
          tone="green"
          delta="Provenance checks"
        />
      </div>

      <div className="dashboard-grid">
        {/* DOCTOR'S ACTIVE APPOINTMENT & EXAM QUEUE */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Today's Clinical Roster & Patient Flow</h3>
              <p className="muted">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · Assigned Clinician: {user.name}
              </p>
            </div>
            <button className="text-button" onClick={() => go('appointments')}>
              Full Schedule <ArrowRight size={15} />
            </button>
          </div>

          <div className="list">
            {todayAppts.length === 0 && (
              <div className="empty">
                <CalendarDays size={28} />
                <b>No appointments scheduled for today</b>
                <span>Use the appointments section to schedule or view upcoming dates.</span>
              </div>
            )}

            {todayAppts.map(a => {
              const patientObj = allPatients.find(p => p.id === a.patientId || p.patientId === a.patientIdCode);
              return (
                <div className="list-row" key={a.id} style={{ alignItems: 'center' }}>
                  <div className="time-block">
                    <b>{a.time}</b>
                    <small>{a.status}</small>
                  </div>
                  <div className="avatar small">{initials(a.patientName)}</div>
                  <div className="row-main">
                    <b>{a.patientName}</b>
                    <span>{a.reason} {a.checkedInAt && `· Waiting: ${waitDuration(a.checkedInAt)}`}</span>
                  </div>
                  <StatusBadge status={a.status} />

                  <div className="row-actions" style={{ marginLeft: 8 }}>
                    {['Waiting', 'Checked In', 'Checked in'].includes(a.status) && (
                      <button
                        className="primary small-btn"
                        onClick={async () => {
                          try {
                            await api.updateAppointment(a.id, { status: 'In Consultation' });
                            notify(`Started consultation with ${a.patientName}`);
                            if (patientObj) onStartConsultation(patientObj);
                            else go('consultations');
                          } catch (e) {
                            notify((e as Error).message);
                          }
                        }}
                      >
                        <Stethoscope size={13} />
                        Call In
                      </button>
                    )}

                    {a.status === 'In Consultation' && (
                      <button
                        className="secondary small-btn"
                        style={{ background: '#f6f7f3', color: '#56655f', borderColor: '#c3cac2' }}
                        onClick={async () => {
                          try {
                            await api.updateAppointment(a.id, { status: 'Completed' });
                            notify(`Encounter with ${a.patientName} marked completed`);
                          } catch (e) {
                            notify((e as Error).message);
                          }
                        }}
                      >
                        <CheckCircle2 size={13} />
                        Complete Visit
                      </button>
                    )}

                    <button
                      className="secondary small-btn"
                      onClick={() => {
                        if (patientObj) onOpenPatient(patientObj);
                        else go('records');
                      }}
                      title="Open EHR Chart"
                    >
                      Chart <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CLINICAL INTELLIGENCE & HIGH-PRIORITY ALERTS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card intelligence-card">
            <div className="card-head">
              <div>
                <h3>Record Review & Alerts</h3>
                <p className="muted">Multi-facility clinical provenance signals</p>
              </div>
              <div className="spark"><Activity size={17} /></div>
            </div>
            <div className="intel-metric">
              <strong>{data.cases.length}</strong>
              <span>external records pending review</span>
            </div>
            <div className="intel-items">
              {data.cases.map(c => (
                <div key={c.id}>
                  <span className={`signal ${c.type}`}></span>
                  <span>
                    <b>{c.title}</b>
                    <small>{c.detail}</small>
                  </span>
                  <ChevronRight size={15} />
                </div>
              ))}
            </div>
            <button className="secondary wide" onClick={() => go('reconciliation')}>
              Review Reconciliation Queue <ArrowRight size={14} />
            </button>
          </div>

          {/* ACTIVE LAB ORDERS AWAITING REVIEW */}
          <div className="card">
            <div className="card-head">
              <div>
                <h3 style={{ fontSize: 14 }}>Recent Lab Orders & Results</h3>
                <p className="muted">Direct diagnostic feed</p>
              </div>
              <button className="text-button" onClick={() => go('labs')}>View Labs <ArrowRight size={13} /></button>
            </div>
            <div className="list">
              {data.labOrders.slice(0, 4).map(o => (
                <div className="list-row" key={o.id} style={{ padding: '8px 0' }}>
                  <div className="row-main">
                    <b>{o.testName}</b>
                    <span>{o.patientName} · {fmtDate(o.requestedAt)}</span>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
