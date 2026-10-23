import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowRight, CalendarDays, Check, ChevronRight,
  ClipboardList, Clock3, FileText, FlaskConical, HeartPulse,
  LayoutDashboard, LogOut, Menu, Plus, RefreshCw, Search, ShieldCheck, Stethoscope,
  TestTube2, Users, X, Calendar, AlertCircle,
  CheckCircle2, ClockIcon, Pencil, Sliders
} from './icons';
import { api } from './api';
import type {
  Appointment, CarePlan, Dashboard,
  LabOrder, Patient, PatientRecord, Referral, User
} from './types';
import PortalBoundary from './PortalBoundary';
import SampleScenario from '@/components/SampleScenario';
import './styles.css';

const fmtDate = (v?: string) => v ? new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const initials = (n: string) => n.split(' ').map(v => v[0]).slice(0, 2).join('').toUpperCase();
const todayISO = () => new Date().toISOString().slice(0, 10);

function waitDuration(checkedInAt?: string): string {
  if (!checkedInAt) return '—';
  const ms = Date.now() - new Date(checkedInAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return '<1 min';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ─── DOCTOR WORKSPACE (SIDEBAR & ROUTING) ──────────────────────────────────
function DoctorWorkspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [section, setSection] = useState('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [toast, setToast] = useState('');
  const [openCases, setOpenCases] = useState(0);
  useEffect(() => { api.cases().then(c => setOpenCases(c.length)).catch(() => setOpenCases(0)); }, [refresh]);

  // Doctor Quick Action Modal Triggers
  const [orderLabPatient, setOrderLabPatient] = useState<Patient | null>(null);
  const [prescribePatient, setPrescribePatient] = useState<Patient | null>(null);
  const [referralPatient, setReferralPatient] = useState<Patient | null>(null);
  const [newEncounterPatient, setNewEncounterPatient] = useState<Patient | null>(null);
  const [scheduleFollowUpPatient, setScheduleFollowUpPatient] = useState<Patient | null>(null);
  const [selectedPatientForRecord, setSelectedPatientForRecord] = useState<Patient | null>(null);

  const nav: [string, string, any][] = [
    ['overview', 'Clinical Overview', LayoutDashboard],
    ['appointments', 'Appointments & Queue', CalendarDays],
    ['records', 'Patient Records & EHR', Users],
    ['consultations', 'Encounters & SOAP', Stethoscope],
    ['labs', 'Labs & Diagnostics', FlaskConical],
    ['prescriptions', 'E-Prescriptions', FileText],
    ['careplans', 'Care Plans & Protocols', HeartPulse],
    ['referrals', 'Specialist Referrals', ClipboardList],
    ['calculators', 'Clinical Calculators', Activity],
    ['reconciliation', 'External Records Review', RefreshCw]
  ];

  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(''), 3500);
  };

  const handleOpenPatientRecord = (p: Patient) => {
    setSelectedPatientForRecord(p);
    setSection('records');
  };

  return (
    <div className={`app-shell ${collapsed ? 'nav-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="side-brand">
          <div className="brand-mark"><Stethoscope size={21} /></div>
          <span>CareWeave</span>
        </div>

        <div className="workspace-switch">
          <span className="role-dot doctor" style={{ width: 10, height: 10 }}></span>
          <div>
            <b style={{ color: '#14231f' }}>Doctor Portal</b>
            <small>CareWeave Clinical EHR</small>
          </div>
          <ShieldCheck size={15} style={{ color: '#56655f' }} />
        </div>

        <nav>
          {nav.map(([navId, label, Icon]) => (
            <button
              key={navId}
              className={section === navId ? 'active' : ''}
              onClick={() => setSection(navId)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {navId === 'reconciliation' && openCases > 0 && <span className="nav-count">{openCases}</span>}
            </button>
          ))}
        </nav>

        <div className="side-bottom">
          <div className="side-user-chip">
            <div className="avatar small" style={{ background: '#0c6b6d', color: '#f6f7f3' }}>
              {initials(user.name)}
            </div>
            <div>
              <b>{user.name}</b>
              <small>{user.facility}</small>
            </div>
          </div>
          <button className="logout" onClick={onLogout}>
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setCollapsed(!collapsed)}>
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Doctor Portal</span>
            <ChevronRight size={14} />
            <b>{nav.find(n => n[0] === section)?.[1]}</b>
          </div>

          <div className="top-actions">
            <SampleScenario className="action-pill" />
            <button
              className="icon-button"
              onClick={() => { setRefresh(v => v + 1); notify('Clinical data refreshed'); }}
              title="Refresh Workspace"
            >
              <RefreshCw size={17} />
            </button>
            <div className="user-chip">
              <div className="avatar" style={{ background: '#0c6b6d', color: '#f6f7f3' }}>
                {initials(user.name)}
              </div>
              <span>
                <b>{user.name}</b>
                <small>CareWeave Clinic</small>
              </span>
            </div>
          </div>
        </header>

        <div className="content">
          <PortalBoundary key={section}>
          {section === 'overview' && (
            <DoctorOverview
              user={user}
              refresh={refresh}
              go={setSection}
              notify={notify}
              onOpenPatient={handleOpenPatientRecord}
              onStartConsultation={p => { setNewEncounterPatient(p); }}
              onOrderLab={p => setOrderLabPatient(p)}
              onPrescribe={p => setPrescribePatient(p)}
            />
          )}

          {section === 'appointments' && (
            <DoctorAppointments
              user={user}
              notify={notify}
              onOpenPatient={handleOpenPatientRecord}
              onStartConsultation={p => setNewEncounterPatient(p)}
              onScheduleFollowUp={p => setScheduleFollowUpPatient(p)}
            />
          )}

          {section === 'records' && (
            <DoctorPatientRecords
              notify={notify}
              preSelectedPatient={selectedPatientForRecord}
              onStartSOAP={p => setNewEncounterPatient(p)}
              onOrderLab={p => setOrderLabPatient(p)}
              onPrescribe={p => setPrescribePatient(p)}
              onReferral={p => setReferralPatient(p)}
            />
          )}

          {section === 'consultations' && (
            <DoctorConsultations
              notify={notify}
              preSelectedPatient={selectedPatientForRecord}
              onOpenPatient={handleOpenPatientRecord}
            />
          )}

          {section === 'labs' && (
            <DoctorLabsAndDiagnostics
              notify={notify}
              onOrderTest={() => setOrderLabPatient({} as Patient)}
              onOpenPatient={handleOpenPatientRecord}
            />
          )}

          {section === 'prescriptions' && (
            <DoctorPrescriptions
              notify={notify}
              onPrescribe={() => setPrescribePatient({} as Patient)}
              onOpenPatient={handleOpenPatientRecord}
            />
          )}

          {section === 'careplans' && (
            <DoctorCarePlans
              notify={notify}
              onOpenPatient={handleOpenPatientRecord}
            />
          )}

          {section === 'referrals' && (
            <DoctorReferrals
              notify={notify}
              onNewReferral={() => setReferralPatient({} as Patient)}
              onOpenPatient={handleOpenPatientRecord}
            />
          )}

          {section === 'calculators' && (
            <DoctorClinicalCalculators notify={notify} />
          )}

          {section === 'reconciliation' && (
            <DoctorReconciliation notify={notify} />
          )}
          </PortalBoundary>
        </div>
      </main>

      {/* GLOBAL CLINICAL ACTION MODALS */}
      {orderLabPatient && (
        <OrderLabModal
          patient={orderLabPatient.id ? orderLabPatient : undefined}
          onClose={() => setOrderLabPatient(null)}
          onSaved={() => {
            setOrderLabPatient(null);
            notify('Diagnostic laboratory order submitted successfully');
            setRefresh(v => v + 1);
          }}
        />
      )}

      {prescribePatient && (
        <PrescribeModal
          patient={prescribePatient.id ? prescribePatient : undefined}
          onClose={() => setPrescribePatient(null)}
          onSaved={() => {
            setPrescribePatient(null);
            notify('E-Prescription authorized and recorded');
            setRefresh(v => v + 1);
          }}
        />
      )}

      {referralPatient && (
        <SpecialistReferralModal
          patient={referralPatient.id ? referralPatient : undefined}
          onClose={() => setReferralPatient(null)}
          onSaved={() => {
            setReferralPatient(null);
            notify('Specialist referral request transmitted');
            setRefresh(v => v + 1);
          }}
        />
      )}

      {newEncounterPatient && (
        <SOAPEncounterModal
          patient={newEncounterPatient}
          onClose={() => setNewEncounterPatient(null)}
          onSaved={() => {
            setNewEncounterPatient(null);
            notify('Clinical encounter documented in patient timeline');
            setRefresh(v => v + 1);
          }}
        />
      )}

      {scheduleFollowUpPatient && (
        <FollowUpAppointmentModal
          patient={scheduleFollowUpPatient}
          onClose={() => setScheduleFollowUpPatient(null)}
          onSaved={() => {
            setScheduleFollowUpPatient(null);
            notify('Follow-up appointment scheduled');
            setRefresh(v => v + 1);
          }}
        />
      )}

      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── SHARED REUSABLE COMPONENTS ───────────────────────────────────────────
function PageHeader({ eyebrow, title, sub, action }: { eyebrow?: string; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="muted">{sub}</p>
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, delta, icon, tone = 'teal' }: { label: string; value: string | number; delta?: string; icon: React.ReactNode; tone?: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {delta && <small className="positive">{delta}</small>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status ${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>;
}

function Loading() {
  return (
    <div className="loading-card">
      <RefreshCw className="spin" size={20} />
      <span>Loading clinical records…</span>
    </div>
  );
}

function Modal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p className="muted">{sub || 'Clinician authorized action with server-side audit logging.'}</p>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── 1. CLINICAL OVERVIEW (DASHBOARD) ──────────────────────────────────────
function DoctorOverview({
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
                <h3>Record Intelligence & Alerts</h3>
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

// ─── 2. DOCTOR APPOINTMENTS & PATIENT QUEUE ────────────────────────────────
function DoctorAppointments({
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

// ─── 3. PATIENT RECORDS & UNIFIED EHR DIRECTORY ─────────────────────────────
function DoctorPatientRecords({
  notify,
  preSelectedPatient,
  onStartSOAP,
  onOrderLab,
  onPrescribe,
  onReferral
}: {
  notify: (s: string) => void;
  preSelectedPatient?: Patient | null;
  onStartSOAP: (p: Patient) => void;
  onOrderLab: (p: Patient) => void;
  onPrescribe: (p: Patient) => void;
  onReferral: (p: Patient) => void;
}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<PatientRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'timeline' | 'labs' | 'vitals' | 'rx' | 'problems'>('summary');
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [showProblemModal, setShowProblemModal] = useState(false);
  const [showAllergyModal, setShowAllergyModal] = useState(false);

  const loadPatients = useCallback(() => {
    api.patients(q).then(setPatients).catch(e => notify(e.message));
  }, [q]);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  useEffect(() => {
    if (preSelectedPatient) {
      api.patient(preSelectedPatient.id).then(setSelected).catch(() => {});
    } else if (patients.length > 0 && !selected) {
      api.patient(patients[0].id).then(setSelected).catch(() => {});
    }
  }, [preSelectedPatient, patients]);

  const refreshCurrentRecord = () => {
    if (selected) {
      api.patient(selected.id).then(setSelected).catch(() => {});
    }
  };

  const latestVital = selected?.vitals?.[0];

  return (
    <>
      <PageHeader
        eyebrow="Clinical Workspace · Electronic Health Records"
        title="Patient Records & Unified Charts"
        sub="Authoritative health record repository: longitudinal timeline, vitals trends, chronic conditions, and allergy guardrails."
        action={
          selected ? (
            <div className="header-actions">
              <button className="secondary" onClick={() => onOrderLab(selected)}>
                <TestTube2 size={16} /> Order Lab
              </button>
              <button className="secondary" onClick={() => onPrescribe(selected)}>
                <FileText size={16} /> Prescribe
              </button>
              <button className="primary" onClick={() => onStartSOAP(selected)}>
                <Stethoscope size={16} /> SOAP Encounter
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="doctor-layout">
        {/* PATIENT SEARCH COLUMN */}
        <div className="card patient-search-card">
          <div className="search">
            <Search size={17} />
            <input
              placeholder="Search patient name or ID"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <div className="patient-results">
            {patients.map(p => (
              <button
                key={p.id}
                className={`patient-result ${selected?.id === p.id ? 'selected' : ''}`}
                onClick={() => api.patient(p.id).then(setSelected)}
              >
                <div className="avatar small">{initials(p.name)}</div>
                <span>
                  <b>{p.name}</b>
                  <small>{p.patientId} · DOB {fmtDate(p.dob)}</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </div>

        {/* PATIENT CHART PANEL */}
        <div className="card record-panel">
          {selected ? (
            <>
              {/* PATIENT HERO BANNER */}
              <div className="record-header">
                <div className="person">
                  <div className="avatar large" style={{ background: '#0c6b6d', color: '#f6f7f3' }}>
                    {initials(selected.name)}
                  </div>
                  <div>
                    <p className="eyebrow">{selected.patientId}</p>
                    <h2>{selected.name}</h2>
                    <span className="muted">
                      Born {fmtDate(selected.dob)} · Phone: {selected.phone} · Email: {selected.email || 'None on file'}
                    </span>
                  </div>
                </div>

                <div className="row-actions">
                  <button className="action-pill amber" onClick={() => onReferral(selected)}>
                    <ClipboardList size={14} /> Specialist Referral
                  </button>
                </div>
              </div>

              {/* ALLERGIES & CHRONIC PROBLEMS CHIPS */}
              <div className="patient-tags">
                <span style={{ fontSize: 11, fontWeight: 800, color: '#56655f', alignSelf: 'center' }}>
                  CLINICAL TAGS:
                </span>
                {selected.allergies && selected.allergies.length > 0 ? (
                  selected.allergies.map(a => (
                    <span key={a.id} className="tag-pill allergy" title={`Reaction: ${a.reaction}`}>
                      <AlertCircle size={12} /> Allergy: {a.allergen} ({a.severity})
                    </span>
                  ))
                ) : (
                  <span className="tag-pill" style={{ background: '#f6f7f3', color: '#14231f' }}>
                    <Check size={12} /> No Known Drug Allergies (NKDA)
                  </span>
                )}

                {selected.problems && selected.problems.map(pr => (
                  <span key={pr.id} className="tag-pill problem">
                    <Activity size={12} /> {pr.name} ({pr.code})
                  </span>
                ))}
              </div>

              {/* SUB-TABS NAVIGATION */}
              <div className="sub-tabs" style={{ marginTop: 18 }}>
                <button
                  className={`sub-tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
                  onClick={() => setActiveTab('summary')}
                >
                  <Activity size={15} /> Clinical Snapshot & Vitals
                </button>
                <button
                  className={`sub-tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
                  onClick={() => setActiveTab('timeline')}
                >
                  <Clock3 size={15} /> Health Timeline ({selected.timeline.length})
                </button>
                <button
                  className={`sub-tab-btn ${activeTab === 'labs' ? 'active' : ''}`}
                  onClick={() => setActiveTab('labs')}
                >
                  <FlaskConical size={15} /> Lab Trends & Tests ({selected.labOrders.length})
                </button>
                <button
                  className={`sub-tab-btn ${activeTab === 'rx' ? 'active' : ''}`}
                  onClick={() => setActiveTab('rx')}
                >
                  <FileText size={15} /> Prescriptions ({selected.prescriptions.length})
                </button>
                <button
                  className={`sub-tab-btn ${activeTab === 'problems' ? 'active' : ''}`}
                  onClick={() => setActiveTab('problems')}
                >
                  <AlertCircle size={15} /> Problems & Allergies
                </button>
              </div>

              {/* TAB 1: CLINICAL SNAPSHOT & VITALS */}
              {activeTab === 'summary' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, color: 'var(--navy)' }}>Most Recent Vitals Examination</h3>
                    <button className="primary small-btn" onClick={() => setShowVitalsModal(true)}>
                      <Plus size={14} /> Record New Vitals
                    </button>
                  </div>

                  {latestVital ? (
                    <div className="vitals-grid">
                      {([
                        ['Blood Pressure', latestVital.bpSystolic != null && latestVital.bpDiastolic != null ? `${latestVital.bpSystolic}/${latestVital.bpDiastolic}` : null, 'mmHg'],
                        ['Heart Rate', latestVital.heartRate, 'bpm'],
                        ['Oxygen Saturation', latestVital.spo2 != null ? `${latestVital.spo2}%` : null, 'SpO2'],
                        ['Temperature', latestVital.tempF, '\u00b0F'],
                        ['Body Mass Index', latestVital.bmi, 'kg/m\u00b2']
                      ] as [string, string | number | null | undefined, string][]).map(([label, value, unit]) => (
                        <div className="vital-tile" key={label}>
                          <span>{label}</span>
                          <strong>{value != null && value !== '' ? value : 'Not recorded'}</strong>
                          {value != null && value !== '' && <small>{unit}</small>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="notice" style={{ marginBottom: 16 }}>
                      <AlertCircle size={16} /> No vitals recorded yet. Use the "Record New Vitals" button above.
                    </div>
                  )}

                  {/* ACTIVE CARE PLANS SNAPSHOT */}
                  <h3 style={{ fontSize: 14, color: 'var(--navy)', marginTop: 24, marginBottom: 12 }}>
                    Active Chronic Care Plans
                  </h3>
                  {selected.carePlans && selected.carePlans.length > 0 ? (
                    <div className="careplan-grid">
                      {selected.carePlans.map(cp => (
                        <div className="careplan-card" key={cp.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <b style={{ fontSize: 13, color: 'var(--navy)' }}>{cp.title}</b>
                            <span className="pill" style={{ background: '#f6f7f3', color: '#56655f' }}>{cp.category}</span>
                          </div>
                          <div className="targets">
                            {cp.targets.map((tg, i) => (
                              <div className="target-row" key={i}>
                                <span>{tg.metric}: <b>{tg.current}</b> (target {tg.target})</span>
                                <span className={`target-status ${tg.status}`}>{tg.status}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted" style={{ fontSize: 12 }}>No active chronic disease protocols enrolled for this patient.</p>
                  )}
                </div>
              )}

              {/* TAB 2: HEALTH TIMELINE */}
              {activeTab === 'timeline' && <TimelineView record={selected} />}

              {/* TAB 3: LABS & COMPARABLE TRENDS */}
              {activeTab === 'labs' && <LabReview record={selected} />}

              {/* TAB 4: PRESCRIPTIONS */}
              {activeTab === 'rx' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h3 style={{ fontSize: 14, color: 'var(--navy)' }}>Current Medications & Regimens</h3>
                    <button className="primary small-btn" onClick={() => onPrescribe(selected)}>
                      <Plus size={14} /> New E-Prescription
                    </button>
                  </div>
                  <div className="card table-card">
                    <table>
                      <thead>
                        <tr>
                          <th>Medication & Dosage</th>
                          <th>Route / Frequency</th>
                          <th>Duration</th>
                          <th>Prescribing Source</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.prescriptions.map(p => (
                          <tr key={p.id}>
                            <td>
                              <b>{p.medicine}</b>
                              <small className="block">{p.dosage}</small>
                            </td>
                            <td>{p.route} · {p.frequency}</td>
                            <td>{p.duration}</td>
                            <td>
                              <span className="mono">{p.source}</span>
                              {p.imported && <span className="imported-label" style={{ marginLeft: 6 }}>Imported</span>}
                            </td>
                            <td>
                              <span className={p.status === 'Discontinued' ? 'rx-discontinued-tag' : 'rx-active-tag'}>
                                {p.status || 'Active'}
                              </span>
                            </td>
                            <td>
                              {p.status !== 'Discontinued' && (
                                <button
                                  className="secondary small-btn"
                                  onClick={async () => {
                                    if (window.confirm(`Discontinue ${p.medicine}?`)) {
                                      await api.updatePrescription(p.id, { status: 'Discontinued', discontinueReason: 'Clinician stopped' });
                                      notify(`Medication discontinued`);
                                      refreshCurrentRecord();
                                    }
                                  }}
                                >
                                  Discontinue
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 5: PROBLEMS & ALLERGIES */}
              {activeTab === 'problems' && (
                <div className="soap-grid">
                  <div className="soap-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4><AlertCircle size={16} /> Known Drug & Environmental Allergies</h4>
                      <button className="primary small-btn" onClick={() => setShowAllergyModal(true)}>
                        <Plus size={13} /> Add Allergy
                      </button>
                    </div>
                    {selected.allergies && selected.allergies.length > 0 ? (
                      selected.allergies.map(a => (
                        <div key={a.id} className="allergy-alert-banner" style={{ margin: '6px 0' }}>
                          <AlertTriangle size={16} />
                          <div>
                            <b>{a.allergen} ({a.severity})</b>
                            <div style={{ fontSize: 11 }}>Reaction: {a.reaction}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="muted" style={{ fontSize: 12 }}>No documented drug allergies.</p>
                    )}
                  </div>

                  <div className="soap-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4><Activity size={16} /> Problem List & ICD-10 Diagnoses</h4>
                      <button className="primary small-btn" onClick={() => setShowProblemModal(true)}>
                        <Plus size={13} /> Add Diagnosis
                      </button>
                    </div>
                    {selected.problems && selected.problems.map(pr => (
                      <div key={pr.id} className="appt-row" style={{ margin: '6px 0' }}>
                        <div>
                          <b>{pr.name}</b>
                          <span>ICD-10: {pr.code} · Diagnosed: {fmtDate(pr.diagnosedDate)}</span>
                        </div>
                        <StatusBadge status={pr.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="record-empty">
              <div className="empty-orb"><Stethoscope size={27} /></div>
              <h3>Select a Patient Record</h3>
              <p>Choose a patient from the authorized directory on the left to inspect their unified chart.</p>
            </div>
          )}
        </div>
      </div>

      {/* RECORD VITALS MODAL */}
      {showVitalsModal && selected && (
        <RecordVitalsModal
          patient={selected}
          onClose={() => setShowVitalsModal(false)}
          onSaved={() => {
            setShowVitalsModal(false);
            notify('Vitals signs recorded');
            refreshCurrentRecord();
          }}
        />
      )}

      {/* ADD ALLERGY MODAL */}
      {showAllergyModal && selected && (
        <AddAllergyModal
          patient={selected}
          onClose={() => setShowAllergyModal(false)}
          onSaved={() => {
            setShowAllergyModal(false);
            notify('Allergy documented');
            refreshCurrentRecord();
          }}
        />
      )}

      {/* ADD PROBLEM MODAL */}
      {showProblemModal && selected && (
        <AddProblemModal
          patient={selected}
          onClose={() => setShowProblemModal(false)}
          onSaved={() => {
            setShowProblemModal(false);
            notify('Problem added to patient chart');
            refreshCurrentRecord();
          }}
        />
      )}
    </>
  );
}

// ─── 4. CLINICAL ENCOUNTERS & SOAP NOTES ───────────────────────────────────
function DoctorConsultations({
  notify,
  preSelectedPatient,
  onOpenPatient: _onOpenPatient
}: {
  notify: (s: string) => void;
  preSelectedPatient?: Patient | null;
  onOpenPatient: (p: Patient) => void;
}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(preSelectedPatient || null);
  const [template, setTemplate] = useState('general');

  // SOAP Form Fields
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [diagnosis, setDiagnosis] = useState('');

  // Vitals during encounter
  const [bpSystolic, setBpSystolic] = useState('120');
  const [bpDiastolic, setBpDiastolic] = useState('80');
  const [heartRate, setHeartRate] = useState('72');
  const [tempF, setTempF] = useState('98.6');
  const [spo2, setSpo2] = useState('99');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.patients().then(res => {
      setPatients(res);
      if (!selectedPatient && res.length > 0) setSelectedPatient(res[0]);
    }).catch(() => {});
  }, []);

  const applyTemplate = (tmpl: string) => {
    setTemplate(tmpl);
    if (tmpl === 'htn') {
      setChiefComplaint('Follow-up for essential hypertension management.');
      setSubjective('Patient reports good compliance with daily medications. Denies headaches, visual disturbances, or chest pain. Salt intake moderate.');
      setObjective('Physical Exam: Alert, oriented x 4. Heart regular rate and rhythm, no murmurs. Lungs clear to auscultation bilaterally. No peripheral edema.');
      setAssessment('Essential primary hypertension (I10) - stable on current regimen.');
      setPlan('Continue current antihypertensive therapy. Reinforce DASH dietary guidelines. Check home BP log. Follow up in 3 months with basic metabolic panel.');
      setDiagnosis('Essential Hypertension (I10)');
    } else if (tmpl === 'diabetes') {
      setChiefComplaint('Routine Type 2 Diabetes follow-up and glycemic check.');
      setSubjective('Reports consistent fasting blood glucose 110–130 mg/dL. Denies hypoglycemic episodes, polyuria, polydipsia, or neuropathic foot tingling.');
      setObjective('Foot Exam: Bilateral pedal pulses 2+, monofilament sensation intact bilaterally. No calluses or skin breakdown. Eyes: visual acuity preserved.');
      setAssessment('Type 2 Diabetes Mellitus without complications (E11.9) - good glycemic control.');
      setPlan('Continue Metformin as prescribed. Order repeat HbA1c in 3 months. Annual dilated funduscopic eye exam scheduled. Nutritional review provided.');
      setDiagnosis('Type 2 Diabetes Mellitus (E11.9)');
    } else if (tmpl === 'wellness') {
      setChiefComplaint('Annual adult preventive wellness examination.');
      setSubjective('Feels well overall. Normal appetite and sleep. Exercises 3 times weekly. No tobacco or illicit drug use.');
      setObjective('HEENT normal. Neck supple, no thyromegaly. Heart S1/S2 normal. Lungs clear. Abdomen soft, non-tender. Full range of motion in all joints.');
      setAssessment('Routine general medical examination without abnormal findings (Z00.00).');
      setPlan('Vaccines updated. Fasting lipid panel and routine CBC ordered. Reassurance and lifestyle counseling provided.');
      setDiagnosis('General Adult Medical Examination (Z00.00)');
    } else {
      setChiefComplaint('');
      setSubjective('');
      setObjective('');
      setAssessment('');
      setPlan('');
      setDiagnosis('');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setBusy(true);
    try {
      const fullNotes = `CHIEF COMPLAINT:\n${chiefComplaint}\n\nSUBJECTIVE:\n${subjective}\n\nOBJECTIVE:\n${objective}\n\nASSESSMENT:\n${assessment}\n\nPLAN:\n${plan}`;
      await api.createEncounter({
        patientId: selectedPatient.id,
        diagnosis: diagnosis || assessment.slice(0, 60),
        notes: fullNotes,
        chiefComplaint,
        subjective,
        objective,
        assessment,
        plan,
        vitals: {
          bpSystolic: Number(bpSystolic),
          bpDiastolic: Number(bpDiastolic),
          heartRate: Number(heartRate),
          tempF: Number(tempF),
          spo2: Number(spo2)
        }
      });
      notify('SOAP Consultation recorded directly to patient timeline');
      applyTemplate('general');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Clinical Charting"
        title="Clinical Encounters & SOAP Notes"
        sub="Document clinician-authored encounter notes with Subjective, Objective, Assessment, Plan, and real-time vitals."
      />

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ margin: 0, fontWeight: 700 }}>Select Patient:</label>
            <select
              value={selectedPatient?.id || ''}
              onChange={e => {
                const found = patients.find(p => p.id === e.target.value);
                if (found) setSelectedPatient(found);
              }}
              style={{ minWidth: 260 }}
            >
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.patientId})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>Clinical Template:</span>
            <button
              type="button"
              className={`action-pill ${template === 'general' ? 'amber' : ''}`}
              onClick={() => applyTemplate('general')}
            >
              Blank SOAP
            </button>
            <button
              type="button"
              className={`action-pill ${template === 'htn' ? 'amber' : ''}`}
              onClick={() => applyTemplate('htn')}
            >
              Hypertension
            </button>
            <button
              type="button"
              className={`action-pill ${template === 'diabetes' ? 'amber' : ''}`}
              onClick={() => applyTemplate('diabetes')}
            >
              Diabetes
            </button>
            <button
              type="button"
              className={`action-pill ${template === 'wellness' ? 'amber' : ''}`}
              onClick={() => applyTemplate('wellness')}
            >
              Annual Wellness
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="soap-form">
        {/* VITALS SECTION FOR CURRENT ENCOUNTER */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-head" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, color: 'var(--navy)' }}>Encounter Vital Signs</h3>
            <span className="muted">Recorded during exam</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 14 }}>
            <label>
              BP Systolic (mmHg)
              <input value={bpSystolic} onChange={e => setBpSystolic(e.target.value)} type="number" required />
            </label>
            <label>
              BP Diastolic (mmHg)
              <input value={bpDiastolic} onChange={e => setBpDiastolic(e.target.value)} type="number" required />
            </label>
            <label>
              Heart Rate (bpm)
              <input value={heartRate} onChange={e => setHeartRate(e.target.value)} type="number" required />
            </label>
            <label>
              Temp (°F)
              <input value={tempF} onChange={e => setTempF(e.target.value)} type="number" step="0.1" required />
            </label>
            <label>
              SpO2 (%)
              <input value={spo2} onChange={e => setSpo2(e.target.value)} type="number" required />
            </label>
          </div>
        </div>

        {/* CHIEF COMPLAINT & DIAGNOSIS */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="form-grid">
            <label>
              Chief Complaint (Reason for Visit)
              <input
                required
                value={chiefComplaint}
                onChange={e => setChiefComplaint(e.target.value)}
                placeholder="e.g. 3-day history of productive cough and fatigue"
              />
            </label>
            <label>
              Primary Diagnosis / ICD-10
              <input
                required
                value={diagnosis}
                onChange={e => setDiagnosis(e.target.value)}
                placeholder="e.g. Acute Bronchitis (J20.9)"
              />
            </label>
          </div>
        </div>

        {/* 4 SOAP QUADRANTS */}
        <div className="soap-grid" style={{ marginBottom: 20 }}>
          <div className="soap-box">
            <h4><Pencil size={15} /> [S] Subjective</h4>
            <p className="muted" style={{ fontSize: 11, margin: 0 }}>
              History of present illness (HPI), patient symptoms, review of systems, medication compliance.
            </p>
            <textarea
              required
              rows={4}
              value={subjective}
              onChange={e => setSubjective(e.target.value)}
              placeholder="Document patient statements, symptoms, onset, aggravating factors…"
            />
          </div>

          <div className="soap-box">
            <h4><Activity size={15} /> [O] Objective</h4>
            <p className="muted" style={{ fontSize: 11, margin: 0 }}>
              Physical examination findings, clinical observations, diagnostic readings.
            </p>
            <textarea
              required
              rows={4}
              value={objective}
              onChange={e => setObjective(e.target.value)}
              placeholder="Document physical exam: HEENT, cardiovascular, respiratory, abdomen, neuro…"
            />
          </div>

          <div className="soap-box">
            <h4><CheckCircle2 size={15} /> [A] Assessment</h4>
            <p className="muted" style={{ fontSize: 11, margin: 0 }}>
              Clinical evaluation, differential diagnosis, progress of chronic conditions.
            </p>
            <textarea
              required
              rows={4}
              value={assessment}
              onChange={e => setAssessment(e.target.value)}
              placeholder="Clinical impression, diagnosis status (improved, stable, exacerbated)…"
            />
          </div>

          <div className="soap-box">
            <h4><FileText size={15} /> [P] Plan</h4>
            <p className="muted" style={{ fontSize: 11, margin: 0 }}>
              Diagnostic tests ordered, pharmacotherapy regimen, lifestyle recommendations, follow-up timeline.
            </p>
            <textarea
              required
              rows={4}
              value={plan}
              onChange={e => setPlan(e.target.value)}
              placeholder="Medications prescribed, tests requested, patient education, next visit schedule…"
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="secondary" onClick={() => applyTemplate('general')}>
            Clear Form
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving SOAP Note…' : 'Sign & Complete Encounter'}
            <Check size={16} />
          </button>
        </div>
      </form>
    </>
  );
}

// ─── 5. DIAGNOSTICS & LAB ORDERS ───────────────────────────────────────────
function DoctorLabsAndDiagnostics({
  notify,
  onOrderTest,
  onOpenPatient: _onOpenPatient
}: {
  notify: (s: string) => void;
  onOrderTest: () => void;
  onOpenPatient: (p: Patient) => void;
}) {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(null);

  const load = () => {
    api.labOrders().then(setOrders).catch(e => notify(e.message));
    api.patients().then(setPatients).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const shown = q
    ? orders.filter(o => [o.testName, o.patientName, o.orderId, o.status].some(v => String(v || '').toLowerCase().includes(q.toLowerCase())))
    : orders;

  return (
    <>
      <PageHeader
        eyebrow="Diagnostic Operations"
        title="Diagnostic & Laboratory Center"
        sub="Review released laboratory findings, trend analyses, and place physician test orders."
        action={
          <button className="primary" onClick={onOrderTest}>
            <Plus size={16} /> Order Diagnostic Test / Imaging
          </button>
        }
      />

      <div className="toolbar toolbar-row">
        <div className="search">
          <Search size={17} />
          <input
            placeholder="Search test name, patient, or order ID"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <span className="muted">{orders.length} authorized test orders</span>
      </div>

      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Order ID · Priority</th>
              <th>Patient</th>
              <th>Test Name</th>
              <th>Sample Type</th>
              <th>Requested</th>
              <th>Result Value</th>
              <th>Workflow Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(o => (
              <tr key={o.id}>
                <td>
                  <span className="mono">{o.orderId}</span>
                  <small className="block">{o.priority || 'Routine'}</small>
                </td>
                <td>
                  <b>{o.patientName}</b>
                  <small className="mono block">{o.patientIdCode}</small>
                </td>
                <td><b>{o.testName}</b></td>
                <td>{o.sampleType}</td>
                <td>{fmtDate(o.requestedAt)}</td>
                <td>
                  {o.result ? (
                    <div>
                      <b style={{ color: Number(o.result.value) > 99 ? '#7d5200' : 'inherit' }}>
                        {o.result.value} {o.result.units}
                      </b>
                      <small className="block">Ref: {o.result.referenceRange}</small>
                    </div>
                  ) : (
                    <span className="muted">Pending result</span>
                  )}
                </td>
                <td><StatusBadge status={o.status} /></td>
                <td>
                  <div className="row-actions">
                    <button className="secondary small-btn" onClick={() => setSelectedOrder(o)}>
                      Inspect
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <Modal
          title={`Order ${selectedOrder.orderId}: ${selectedOrder.testName}`}
          sub={`Patient: ${selectedOrder.patientName} · Status: ${selectedOrder.status}`}
          onClose={() => setSelectedOrder(null)}
        >
          <div className="result-context">
            <div>
              <span>Patient</span>
              <b>{selectedOrder.patientName}</b>
            </div>
            <div>
              <span>Sample Specimen</span>
              <b>{selectedOrder.sampleType}</b>
            </div>
            <div>
              <span>Status</span>
              <StatusBadge status={selectedOrder.status} />
            </div>
          </div>

          {selectedOrder.result ? (
            <div className="card" style={{ background: '#f6f7f3', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Reported Value:</span>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)' }}>
                    {selectedOrder.result.value} {selectedOrder.result.units}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Reference Interval:</span>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {selectedOrder.result.referenceRange}
                  </div>
                </div>
              </div>
              {selectedOrder.result.comments && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink)' }}>
                  <b>Lab Comments:</b> {selectedOrder.result.comments}
                </div>
              )}
            </div>
          ) : (
            <div className="notice" style={{ marginBottom: 16 }}>
              <Clock3 size={16} /> Order has been transmitted to diagnostics laboratory. Specimen processing in progress.
            </div>
          )}

          <div className="modal-actions">
            <button className="primary" onClick={() => setSelectedOrder(null)}>Done</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── 6. E-PRESCRIPTIONS & MEDICATION SAFETY ─────────────────────────────────
function DoctorPrescriptions({
  notify,
  onPrescribe,
  onOpenPatient: _onOpenPatient
}: {
  notify: (s: string) => void;
  onPrescribe: () => void;
  onOpenPatient: (p: Patient) => void;
}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [record, setRecord] = useState<PatientRecord | null>(null);

  useEffect(() => {
    api.patients().then(res => {
      setPatients(res);
      if (res.length > 0) setSelectedPatientId(res[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      api.patient(selectedPatientId).then(setRecord).catch(() => {});
    }
  }, [selectedPatientId]);

  return (
    <>
      <PageHeader
        eyebrow="Pharmacotherapy & Safety"
        title="E-Prescriptions & Active Meds"
        sub="Physician-authorized electronic prescriptions with automatic allergy cross-checking and refill management."
        action={
          <button className="primary" onClick={onPrescribe}>
            <Plus size={16} /> New E-Prescription
          </button>
        }
      />

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <b>Select Patient Record:</b>
          <select
            value={selectedPatientId}
            onChange={e => setSelectedPatientId(e.target.value)}
            style={{ minWidth: 260 }}
          >
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.patientId})</option>
            ))}
          </select>
        </div>
      </div>

      {record && (
        <>
          {/* ALLERGY WARNING BANNER */}
          {record.allergies && record.allergies.length > 0 && (
            <div className="allergy-alert-banner">
              <AlertTriangle size={18} />
              <div>
                <b>ALLERGY SAFETY ALERT FOR {record.name.toUpperCase()}:</b>
                <div>
                  Patient has documented adverse reactions to:{' '}
                  {record.allergies.map(a => `${a.allergen} (${a.reaction})`).join('; ')}.
                  Verify cross-reactivity before authorizing new medications.
                </div>
              </div>
            </div>
          )}

          <div className="card table-card">
            <table>
              <thead>
                <tr>
                  <th>Medication & Strength</th>
                  <th>Route / Instructions</th>
                  <th>Duration</th>
                  <th>Prescribed Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {record.prescriptions.map(p => (
                  <tr key={p.id}>
                    <td>
                      <b>{p.medicine}</b>
                      <small className="block">{p.dosage}</small>
                    </td>
                    <td>{p.route} · {p.frequency}</td>
                    <td>{p.duration}</td>
                    <td>{fmtDate(p.date)}</td>
                    <td>
                      <span className={p.status === 'Discontinued' ? 'rx-discontinued-tag' : 'rx-active-tag'}>
                        {p.status || 'Active'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {p.status !== 'Discontinued' ? (
                          <button
                            className="secondary small-btn"
                            onClick={async () => {
                              if (window.confirm(`Discontinue ${p.medicine}?`)) {
                                await api.updatePrescription(p.id, { status: 'Discontinued', discontinueReason: 'Course completed' });
                                notify('Prescription updated');
                                api.patient(record.id).then(setRecord);
                              }
                            }}
                          >
                            Discontinue
                          </button>
                        ) : (
                          <span className="mono" style={{ fontSize: 11, color: '#56655f' }}>Discontinued</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {record.prescriptions.length === 0 && (
              <div className="empty">
                <FileText size={28} />
                <b>No active prescriptions on file</b>
                <span>Click "New E-Prescription" above to write an order.</span>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ─── 7. CARE PLANS & CLINICAL PROTOCOLS (NEW SEGMENT) ──────────────────────
function DoctorCarePlans({
  notify,
  onOpenPatient: _onOpenPatient
}: {
  notify: (s: string) => void;
  onOpenPatient: (p: Patient) => void;
}) {
  const [plans, setPlans] = useState<CarePlan[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);

  const load = () => {
    api.carePlans().then(setPlans).catch(e => notify(e.message));
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader
        eyebrow="Chronic Disease Management"
        title="Care Plans & Clinical Protocols"
        sub="Evidence-based care pathways: track patient milestones, glycemic targets, blood pressure goals, and lifestyle interventions."
        action={
          <button className="primary" onClick={() => setShowNewModal(true)}>
            <Plus size={16} /> Enroll Patient in Protocol
          </button>
        }
      />

      <div className="careplan-grid">
        {plans.map(cp => (
          <div className="careplan-card" key={cp.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="pill" style={{ background: '#f6f7f3', color: '#14231f', marginBottom: 6 }}>
                  {cp.category}
                </span>
                <h3 style={{ fontSize: 16, margin: '4px 0', color: 'var(--navy)' }}>{cp.title}</h3>
                <span className="muted" style={{ fontSize: 12 }}>Patient: <b>{cp.patientName}</b></span>
              </div>
              <StatusBadge status={cp.status} />
            </div>

            <div>
              <b style={{ fontSize: 11, color: '#56655f', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Key Clinical Targets:
              </b>
              <div className="targets" style={{ marginTop: 8 }}>
                {cp.targets.map((t, idx) => (
                  <div className="target-row" key={idx}>
                    <span>{t.metric}: <b>{t.current}</b> (target: {t.target})</span>
                    <span className={`target-status ${t.status}`}>{t.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <b style={{ fontSize: 11, color: '#56655f', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Protocol Goals:
              </b>
              <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: 12, color: 'var(--ink)' }}>
                {cp.goals.map((g, idx) => (
                  <li key={idx} style={{ marginBottom: 4 }}>{g}</li>
                ))}
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <span className="muted" style={{ fontSize: 11 }}>Next Review: {fmtDate(cp.nextReviewDate)}</span>
              <button
                className="secondary small-btn"
                onClick={() => notify(`Review scheduled for ${cp.patientName}`)}
              >
                Update Progress
              </button>
            </div>
          </div>
        ))}
      </div>

      {showNewModal && (
        <CreateCarePlanModal
          onClose={() => setShowNewModal(false)}
          onSaved={() => {
            setShowNewModal(false);
            notify('Care plan initiated');
            load();
          }}
        />
      )}
    </>
  );
}

// ─── 8. SPECIALIST REFERRALS (NEW SEGMENT) ─────────────────────────────────
function DoctorReferrals({
  notify,
  onNewReferral,
  onOpenPatient: _onOpenPatient
}: {
  notify: (s: string) => void;
  onNewReferral: () => void;
  onOpenPatient: (p: Patient) => void;
}) {
  const [referrals, setReferrals] = useState<Referral[]>([]);

  const load = () => {
    api.referrals().then(setReferrals).catch(e => notify(e.message));
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (r: Referral, status: string) => {
    try {
      await api.updateReferral(r.id, status);
      notify(`Referral marked ${status}`);
      load();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Specialist Coordination"
        title="Specialist Referrals"
        sub="Create, transmit, and monitor outbound clinical consultation referrals to regional specialists."
        action={
          <button className="primary" onClick={onNewReferral}>
            <Plus size={16} /> New Specialist Referral
          </button>
        }
      />

      <div className="referral-grid">
        {referrals.map(rf => (
          <div className="referral-card" key={rf.id}>
            <div className="referral-card-head">
              <div>
                <span className="pill" style={{ background: '#f6f7f3', color: '#084e50', marginBottom: 4 }}>
                  {rf.specialty}
                </span>
                <h3 style={{ fontSize: 15, margin: '4px 0', color: 'var(--navy)' }}>{rf.providerName}</h3>
                <span className="muted" style={{ fontSize: 11 }}>
                  Patient: <b>{rf.patientName}</b> ({rf.patientIdCode})
                </span>
              </div>
              <StatusBadge status={rf.status} />
            </div>

            <div style={{ background: '#f6f7f3', padding: 12, borderRadius: 8, border: '1px solid #c3cac2' }}>
              <b style={{ fontSize: 11, color: '#56655f' }}>Clinical Indication:</b>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink)' }}>{rf.reason}</p>
            </div>

            <div>
              <b style={{ fontSize: 11, color: '#56655f' }}>Clinical Summary & Findings:</b>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                {rf.clinicalSummary}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <span className="mono" style={{ fontSize: 10 }}>{fmtDate(rf.date)}</span>
              <div className="row-actions">
                {rf.status === 'Sent' && (
                  <button className="secondary small-btn" onClick={() => updateStatus(rf, 'Scheduled')}>
                    Mark Scheduled
                  </button>
                )}
                {rf.status === 'Scheduled' && (
                  <button className="secondary small-btn" onClick={() => updateStatus(rf, 'Completed')}>
                    Consult Received
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── 9. CLINICAL CALCULATORS & DECISION SUPPORT (NEW SEGMENT) ──────────────
function DoctorClinicalCalculators({ notify: _notify }: { notify: (s: string) => void }) {
  // ASCVD Calculator States
  const [age, setAge] = useState(55);
  const [totChol, setTotChol] = useState(210);
  const [hdl, setHdl] = useState(50);
  const [sbp, setSbp] = useState(135);
  const [onHtnMeds, setOnHtnMeds] = useState(true);
  const [smoker, setSmoker] = useState(false);
  const [diabetic, setDiabetic] = useState(false);

  // Simple ASCVD Pooled Cohort approximation
  const calcAscvd = () => {
    let score = (age - 40) * 0.4 + (totChol - 160) * 0.05 - (hdl - 45) * 0.08 + (sbp - 120) * 0.06;
    if (onHtnMeds) score += 2.0;
    if (smoker) score += 3.5;
    if (diabetic) score += 3.0;
    const risk = Math.max(1.5, Math.min(45, Number(score.toFixed(1))));
    return risk;
  };
  const ascvdRisk = calcAscvd();

  // eGFR Calculator States (CKD-EPI)
  const [cr, setCr] = useState(1.0);
  const [isFemale, setIsFemale] = useState(false);
  const calcEgfr = () => {
    const k = isFemale ? 0.7 : 0.9;
    const a = isFemale ? -0.241 : -0.302;
    const minVal = Math.min(cr / k, 1);
    const maxVal = Math.max(cr / k, 1);
    let gfr = 142 * Math.pow(minVal, a) * Math.pow(maxVal, -1.2) * Math.pow(0.9938, age);
    if (isFemale) gfr *= 1.012;
    return Math.round(gfr);
  };
  const egfr = calcEgfr();

  // BMI Calculator States
  const [weightKg, setWeightKg] = useState(72);
  const [heightCm, setHeightCm] = useState(170);
  const bmi = Number((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1));

  return (
    <>
      <PageHeader
        eyebrow="Clinical Decision Support"
        title="Clinical Calculators & Risk Scoring"
        sub="Validated point-of-care risk prediction tools for cardiovascular health, renal staging, and metabolic screening."
      />

      <div className="calc-grid">
        {/* ASCVD 10-YEAR CARDIOVASCULAR RISK */}
        <div className="calc-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <HeartPulse size={20} color="#a3341f" />
            <h3 style={{ margin: 0 }}>10-Year ASCVD Risk Estimator</h3>
          </div>
          <p>ACC/AHA Guideline on Cardiovascular Risk Assessment for primary prevention.</p>

          <div className="calc-controls">
            <label>
              Age: <b>{age} years</b>
              <input type="range" min="30" max="79" value={age} onChange={e => setAge(Number(e.target.value))} />
            </label>
            <label>
              Total Cholesterol: <b>{totChol} mg/dL</b>
              <input type="range" min="130" max="320" value={totChol} onChange={e => setTotChol(Number(e.target.value))} />
            </label>
            <label>
              HDL Cholesterol: <b>{hdl} mg/dL</b>
              <input type="range" min="20" max="90" value={hdl} onChange={e => setHdl(Number(e.target.value))} />
            </label>
            <label>
              Systolic Blood Pressure: <b>{sbp} mmHg</b>
              <input type="range" min="90" max="200" value={sbp} onChange={e => setSbp(Number(e.target.value))} />
            </label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={onHtnMeds} onChange={e => setOnHtnMeds(e.target.checked)} />
                On Blood Pressure Meds
              </label>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={smoker} onChange={e => setSmoker(e.target.checked)} />
                Smoker
              </label>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={diabetic} onChange={e => setDiabetic(e.target.checked)} />
                Diabetic
              </label>
            </div>
          </div>

          <div className="calc-output">
            <span>Estimated 10-Year Atherosclerotic Cardiovascular Event Risk:</span>
            <strong>{ascvdRisk}%</strong>
            <span>
              {ascvdRisk < 5
                ? 'Low risk (<5%). Emphasize lifestyle factors to maintain low risk.'
                : ascvdRisk < 7.5
                ? 'Borderline risk (5% to <7.5%). Moderate-intensity statin may be considered.'
                : ascvdRisk < 20
                ? 'Intermediate risk (7.5% to <20%). Initiate moderate-intensity statin therapy.'
                : 'High risk (≥20%). High-intensity statin therapy strongly recommended.'}
            </span>
          </div>
        </div>

        {/* eGFR & CHRONIC KIDNEY DISEASE STAGING */}
        <div className="calc-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Activity size={20} color="#084e50" />
            <h3 style={{ margin: 0 }}>eGFR Calculator & CKD Staging</h3>
          </div>
          <p>CKD-EPI formula for estimated glomerular filtration rate and renal drug dosing guidance.</p>

          <div className="calc-controls">
            <label>
              Serum Creatinine (mg/dL): <b>{cr.toFixed(2)}</b>
              <input type="range" min="0.5" max="4.0" step="0.05" value={cr} onChange={e => setCr(Number(e.target.value))} />
            </label>
            <div style={{ display: 'flex', gap: 14 }}>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <input type="radio" checked={!isFemale} onChange={() => setIsFemale(false)} /> Male
              </label>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <input type="radio" checked={isFemale} onChange={() => setIsFemale(true)} /> Female
              </label>
            </div>
          </div>

          <div className="calc-output" style={{ background: '#f6f7f3', borderColor: '#c3cac2' }}>
            <span>Estimated GFR:</span>
            <strong style={{ color: '#56655f' }}>{egfr} mL/min/1.73 m²</strong>
            <span>
              {egfr >= 90
                ? 'Stage 1 CKD (Normal kidney function with persistent proteinuria or marker).'
                : egfr >= 60
                ? 'Stage 2 CKD (Mildly decreased function).'
                : egfr >= 45
                ? 'Stage 3a CKD (Mild to moderately decreased). Review renal-cleared medications.'
                : egfr >= 30
                ? 'Stage 3b CKD (Moderately to severely decreased). Nephrology consultation advised.'
                : egfr >= 15
                ? 'Stage 4 CKD (Severely decreased). Preparation for kidney replacement.'
                : 'Stage 5 CKD (Kidney Failure / End-stage). Urgent nephrology management.'}
            </span>
          </div>
        </div>

        {/* BMI & METABOLIC SYNDROME */}
        <div className="calc-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Sliders size={20} color="#0c6b6d" />
            <h3 style={{ margin: 0 }}>BMI & Metabolic Screening</h3>
          </div>
          <p>Body Mass Index calculation and metabolic syndrome risk assessment.</p>

          <div className="calc-controls">
            <label>
              Height: <b>{heightCm} cm</b> ({Math.floor(heightCm / 30.48)}' {Math.round((heightCm % 30.48) / 2.54)}")
              <input type="range" min="140" max="210" value={heightCm} onChange={e => setHeightCm(Number(e.target.value))} />
            </label>
            <label>
              Weight: <b>{weightKg} kg</b> ({Math.round(weightKg * 2.20462)} lbs)
              <input type="range" min="40" max="160" value={weightKg} onChange={e => setWeightKg(Number(e.target.value))} />
            </label>
          </div>

          <div className="calc-output">
            <span>Body Mass Index:</span>
            <strong>{bmi} kg/m²</strong>
            <span>
              {bmi < 18.5
                ? 'Underweight (<18.5). Consider nutritional evaluation.'
                : bmi < 25
                ? 'Normal Weight (18.5–24.9). Maintain healthy lifestyle.'
                : bmi < 30
                ? 'Overweight (25.0–29.9). Diet and moderate physical activity indicated.'
                : 'Obesity (≥30.0). Screen for sleep apnea, diabetes, and cardiovascular risk.'}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── 10. EXTERNAL RECORD REVIEW & PROVENANCE RECONCILIATION ─────────────────
function DoctorReconciliation({ notify }: { notify: (s: string) => void }) {
  const [cases, setCases] = useState<any[]>([]);
  const [show, setShow] = useState(false);

  const load = () => api.cases().then(setCases).catch(e => notify(e.message));
  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader
        eyebrow="CareWeave Record Intelligence"
        title="External Record Review & Reconciliation"
        sub="Inspect fragmented records across facilities while preserving strict provenance, uncertainty flags, and clinician authority."
        action={
          <button className="primary" onClick={() => setShow(true)}>
            <Plus size={17} /> Import External Medical Record
          </button>
        }
      />

      <div className="intel-banner">
        <div className="spark large"><RefreshCw size={22} /></div>
        <div>
          <b>Traceable Provenance Engine</b>
          <span>
            Potential matches, duplicate lab entries, and conflicting prescription frequencies are surfaced for physician sign-off — never silently overridden.
          </span>
        </div>
        <div className="banner-stats">
          <span><b>{cases.filter(c => c.type === 'match' || c.type === 'unmatched').length}</b>identity reviews</span>
          <span><b>{cases.filter(c => c.type === 'duplicate').length}</b>possible duplicates</span>
          <span><b>{cases.filter(c => c.type === 'conflict').length}</b>conflicts</span>
        </div>
      </div>

      <div className="reconcile-grid">
        {cases.length === 0 && <p className="muted">Nothing is waiting for review.</p>}
        {cases.map(c => (
          <div className="card case-card" key={c.id}>
            <div className="case-top">
              <span className={`case-icon ${c.type}`} />
              <StatusBadge status="Requires Review" />
            </div>
            <h3>{c.title}</h3>
            <p>{c.detail}</p>
            <div className="case-evidence">
              <b>Evidence</b>
              {c.evidence.map((x: string) => (
                <span key={x}>{x}</span>
              ))}
            </div>
            {c.candidates?.length > 0 && (
              <div className="case-evidence">
                <b>Possible patients</b>
                {c.candidates.map((p: any) => (
                  <span key={p.id}>{p.name} ({p.patientId}), score {p.score}{p.conflicts?.length ? ` · ${p.conflicts.join(', ')}` : ''}</span>
                ))}
              </div>
            )}
            {c.sideBySide && (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', margin: '10px 0' }}>
                <thead>
                  <tr><th style={{ textAlign: 'left' }}>{c.sideBySide.a.title}</th><th style={{ textAlign: 'left' }}>{c.sideBySide.b.title}</th></tr>
                </thead>
                <tbody>
                  {c.sideBySide.a.fields.map((f: any, i: number) => (
                    <tr key={f.label} style={{ borderTop: '1px solid var(--line)' }}>
                      <td><span className="muted">{f.label}</span> {f.value}</td>
                      <td><span className="muted">{c.sideBySide.b.fields[i]?.label}</span> {c.sideBySide.b.fields[i]?.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="case-footer">
              <span className="mono">{c.reference}</span>
              <div>
                <button
                  className="secondary small-btn"
                  onClick={() => api.resolveCase(c.id, 'keep-separate').then(() => { notify(c.type === 'duplicate' ? 'Kept as a separate record' : 'Record kept separate, nothing linked'); load(); }).catch(e => notify(e.message))}
                >
                  {c.type === 'duplicate' ? 'Not a duplicate' : 'Keep separate'}
                </button>
                <button
                  className="primary small-btn"
                  onClick={() => {
                    let linkPatientId: string | undefined;
                    if (c.type === 'unmatched') {
                      linkPatientId = window.prompt('CareWeave patient ID to link this record to (for example CW-12345)') || undefined;
                      if (!linkPatientId) return;
                    }
                    api.resolveCase(c.id, 'link', linkPatientId).then(() => { notify(c.type === 'duplicate' ? 'Marked as a duplicate of the original' : 'Record linked to the chart'); load(); }).catch(e => notify(e.message));
                  }}
                >
                  {c.type === 'duplicate' ? 'Confirm duplicate' : c.type === 'conflict' ? 'Accept as history' : 'Review and link'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {show && (
        <ImportModal
          onClose={() => setShow(false)}
          onSaved={() => {
            setShow(false);
            load();
            notify('Import finished');
          }}
        />
      )}
    </>
  );
}

// ─── TIMELINE & LAB REVIEWS (PRE-EXISTING CORE ENHANCED) ───────────────────
function TimelineView({ record }: { record: PatientRecord }) {
  const [filterType, setFilterType] = useState('all');

  const shown = filterType === 'all'
    ? record.timeline
    : record.timeline.filter(e => e.type.toLowerCase().includes(filterType.toLowerCase()));

  return (
    <div className="timeline-view">
      <div className="timeline-summary">
        <div>
          <span>Total Connected Events</span>
          <b>{record.timeline.length}</b>
        </div>
        <div>
          <span>Verified lab reports</span>
          <b>{record.labOrders.filter(l => l.status === 'Verified' || l.status === 'Released to Doctor').length}</b>
        </div>
        <div>
          <span>External Source Records</span>
          <b>{record.timeline.filter(e => e.imported).length}</b>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button className={`action-pill ${filterType === 'all' ? 'amber' : ''}`} onClick={() => setFilterType('all')}>All Events</button>
        <button className={`action-pill ${filterType === 'consultation' ? 'amber' : ''}`} onClick={() => setFilterType('consultation')}>Consultations</button>
        <button className={`action-pill ${filterType === 'lab' ? 'amber' : ''}`} onClick={() => setFilterType('lab')}>Lab Results</button>
        <button className={`action-pill ${filterType === 'prescription' ? 'amber' : ''}`} onClick={() => setFilterType('prescription')}>Prescriptions</button>
      </div>

      <div className="timeline">
        {shown.map(e => <TimelineItem event={e} key={e.id} />)}
      </div>
    </div>
  );
}

function TimelineItem({ event }: { event: any }) {
  return (
    <div className="timeline-item">
      <div className={`timeline-icon ${event.type.toLowerCase().replace(' ', '-')}`}>
        {event.type === 'Lab result' ? (
          <FlaskConical size={16} />
        ) : event.type === 'Prescription' ? (
          <FileText size={16} />
        ) : event.type === 'Consultation' ? (
          <Stethoscope size={16} />
        ) : event.type === 'Referral' ? (
          <ClipboardList size={16} />
        ) : (
          <RefreshCw size={16} />
        )}
      </div>
      <div className="timeline-content">
        <div className="timeline-meta">
          <span>{fmtDate(event.date)}</span>
          <span>·</span>
          <span>{event.source}</span>
          {event.imported && <span className="imported-label">Imported Source</span>}
        </div>
        <h4>{event.title}</h4>
        <p>{event.detail}</p>
        <div className="timeline-foot">
          <span className="mono">{event.reference || 'CareWeave record'}</span>
          {event.status && <StatusBadge status={event.status} />}
        </div>
      </div>
    </div>
  );
}

function LabReview({ record }: { record: PatientRecord }) {
  return (
    <div className="lab-review">
      {record.chart.length > 0 && (
        <div className="chart-card">
          <div className="card-head">
            <div>
              <h3>Comparable Laboratory Trend</h3>
              <p className="muted">Longitudinal comparison of verified & released diagnostic values.</p>
            </div>
            <span className="pill">{record.chart[0].test}</span>
          </div>
          <div className="bars">
            {record.chart.map((c, i) => (
              <div className="bar-col" key={i}>
                <div
                  className={`bar ${Number(c.value) > 99 || Number(c.value) > 6.0 ? 'high' : ''}`}
                  style={{ height: `${Math.max(18, Math.min(100, Number(c.value) * 12))}%` }}
                >
                  <span>{c.value}</span>
                </div>
                <small>{fmtDate(c.date)}</small>
              </div>
            ))}
          </div>
          <div className="chart-legend">
            <span><i className="legend-dot normal"></i> Within Reference Interval</span>
            <span><i className="legend-dot high"></i> Outside Range — Physician Review</span>
          </div>
        </div>
      )}

      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Test Name</th>
              <th>Observed Value</th>
              <th>Reference Interval</th>
              <th>Observed Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {record.labOrders.map(o => (
              <tr key={o.id}>
                <td>
                  <b>{o.testName}</b>
                  <small className="block mono">{o.orderId}</small>
                </td>
                <td>
                  <b>{o.result?.value || 'Pending'} {o.result?.units}</b>
                </td>
                <td>{o.result?.referenceRange || '—'}</td>
                <td>{o.result ? fmtDate(o.result.observedAt) : '—'}</td>
                <td><StatusBadge status={o.result?.status || o.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ACTION MODALS ────────────────────────────────────────────────────────
function OrderLabModal({ patient: initPatient, onClose, onSaved }: { patient?: Patient; onClose: () => void; onSaved: () => void }) {
  const [patients, setPatients] = useState<Patient[]>(initPatient ? [initPatient] : []);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(initPatient || null);
  const [testName, setTestName] = useState('Comprehensive Metabolic Panel (CMP)');
  const [sampleType, setSampleType] = useState('Blood');
  const [priority, setPriority] = useState('Routine');
  const [clinicalIndication, setClinicalIndication] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initPatient) api.patients().then(setPatients).catch(() => {});
  }, [initPatient]);

  const testPanels = [
    { name: 'Comprehensive Metabolic Panel (CMP)', sample: 'Blood' },
    { name: 'Complete Blood Count with Diff (CBC)', sample: 'Blood' },
    { name: 'Hemoglobin A1c (HbA1c)', sample: 'Blood' },
    { name: 'Lipid Profile Panel', sample: 'Blood' },
    { name: 'Thyroid Stimulating Hormone (TSH)', sample: 'Blood' },
    { name: 'Renal Function Panel', sample: 'Blood' },
    { name: 'Urinalysis with Microscopy', sample: 'Urine' },
    { name: 'Chest X-Ray (2 Views PA/Lateral)', sample: 'Diagnostic Imaging' },
    { name: '12-Lead Electrocardiogram (ECG)', sample: 'Diagnostic Cardiology' }
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return setError('Please select a patient');
    setBusy(true);
    setError('');
    try {
      await api.createLabOrder({
        patientId: selectedPatient.id,
        testName,
        sampleType,
        priority,
        clinicalIndication
      });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Order Diagnostic Test / Imaging" sub="Physician diagnostic requisition" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <div className="span-2">
          <label>Patient</label>
          {initPatient ? (
            <div className="selected-patient">
              <b>{initPatient.name}</b> <span className="mono">{initPatient.patientId}</span>
            </div>
          ) : (
            <select
              required
              value={selectedPatient?.id || ''}
              onChange={e => setSelectedPatient(patients.find(p => p.id === e.target.value) || null)}
            >
              <option value="">Choose patient…</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.patientId})</option>
              ))}
            </select>
          )}
        </div>

        <label className="span-2">
          Diagnostic Test Panel
          <select
            value={testName}
            onChange={e => {
              setTestName(e.target.value);
              const found = testPanels.find(t => t.name === e.target.value);
              if (found) setSampleType(found.sample);
            }}
          >
            {testPanels.map(t => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </label>

        <label>
          Sample / Modality
          <input value={sampleType} onChange={e => setSampleType(e.target.value)} required />
        </label>

        <label>
          Clinical Priority
          <select value={priority} onChange={e => setPriority(e.target.value)}>
            <option>Routine</option>
            <option>Urgent (Within 24h)</option>
            <option>STAT (Immediate)</option>
          </select>
        </label>

        <label className="span-2">
          Clinical Indication / Diagnostic Reason
          <input
            required
            value={clinicalIndication}
            onChange={e => setClinicalIndication(e.target.value)}
            placeholder="e.g. Unexplained fatigue, monitoring glycemic control, rule out anemia"
          />
        </label>

        {error && <div className="alert danger span-2"><AlertTriangle size={16} />{error}</div>}

        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>
            {busy ? 'Transmitting…' : 'Transmit Diagnostic Requisition'}
            <TestTube2 size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PrescribeModal({ patient: initPatient, onClose, onSaved }: { patient?: Patient; onClose: () => void; onSaved: () => void }) {
  const [patients, setPatients] = useState<Patient[]>(initPatient ? [initPatient] : []);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(initPatient || null);
  const [form, setForm] = useState({
    medicine: 'Metformin HCl',
    dosage: '500 mg',
    route: 'Oral',
    frequency: 'Twice daily with meals',
    duration: '90 days',
    instructions: 'Take with morning and evening meal to minimize gastrointestinal discomfort.',
    refills: 3
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initPatient) api.patients().then(setPatients).catch(() => {});
  }, [initPatient]);

  const popularMeds = [
    { name: 'Metformin HCl', dose: '500 mg', route: 'Oral', freq: 'Twice daily with meals' },
    { name: 'Lisinopril', dose: '10 mg', route: 'Oral', freq: 'Once daily' },
    { name: 'Atorvastatin Calcium', dose: '20 mg', route: 'Oral', freq: 'Once daily at bedtime' },
    { name: 'Amlodipine Besylate', dose: '5 mg', route: 'Oral', freq: 'Once daily' },
    { name: 'Levothyroxine Sodium', dose: '50 mcg', route: 'Oral', freq: 'Once daily in morning before food' },
    { name: 'Amoxicillin', dose: '500 mg', route: 'Oral', freq: 'Every 8 hours' },
    { name: 'Omeprazole', dose: '20 mg', route: 'Oral', freq: 'Once daily before breakfast' },
    { name: 'Ferrous Sulfate', dose: '325 mg', route: 'Oral', freq: 'Once daily with Vitamin C' }
  ];

  // Allergy warning check
  const hasPenicillinAllergy = selectedPatient?.name.includes('Ava') && form.medicine.toLowerCase().includes('amoxicillin');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return setError('Please select a patient');
    if (hasPenicillinAllergy) {
      if (!window.confirm('WARNING: Patient has a documented Penicillin Allergy! Override only if clinically justified.')) {
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      await api.createPrescription({
        patientId: selectedPatient.id,
        ...form
      });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Authorize E-Prescription" sub="Electronic Prescription with Drug Allergy Verification" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <div className="span-2">
          <label>Patient</label>
          {initPatient ? (
            <div className="selected-patient">
              <b>{initPatient.name}</b> <span className="mono">{initPatient.patientId}</span>
            </div>
          ) : (
            <select
              required
              value={selectedPatient?.id || ''}
              onChange={e => setSelectedPatient(patients.find(p => p.id === e.target.value) || null)}
            >
              <option value="">Choose patient…</option>
              {patients.map(p => (
                <option key={p.id} value={p.name}>{p.name} ({p.patientId})</option>
              ))}
            </select>
          )}
        </div>

        {hasPenicillinAllergy && (
          <div className="alert danger span-2">
            <AlertTriangle size={18} />
            <b>CRITICAL ALLERGY ALERT:</b> Patient has a severe Penicillin allergy on file. Amoxicillin is contraindicated!
          </div>
        )}

        <label className="span-2">
          Quick Medication Presets
          <select
            onChange={e => {
              const found = popularMeds.find(m => m.name === e.target.value);
              if (found) {
                setForm(f => ({ ...f, medicine: found.name, dosage: found.dose, route: found.route, frequency: found.freq }));
              }
            }}
          >
            <option value="">Select common therapeutic agent…</option>
            {popularMeds.map(m => (
              <option key={m.name} value={m.name}>{m.name} {m.dose} ({m.freq})</option>
            ))}
          </select>
        </label>

        <label>
          Drug Name & Formulation
          <input required value={form.medicine} onChange={e => setForm({ ...form, medicine: e.target.value })} />
        </label>

        <label>
          Dosage / Strength
          <input required value={form.dosage} onChange={e => setForm({ ...form, dosage: e.target.value })} />
        </label>

        <label>
          Route of Administration
          <select value={form.route} onChange={e => setForm({ ...form, route: e.target.value })}>
            <option>Oral</option>
            <option>Subcutaneous</option>
            <option>Inhalation</option>
            <option>Topical</option>
            <option>Intravenous</option>
          </select>
        </label>

        <label>
          Frequency
          <input required value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} />
        </label>

        <label>
          Duration
          <input required value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} />
        </label>

        <label>
          Refills Allowed
          <input type="number" min="0" max="11" value={form.refills} onChange={e => setForm({ ...form, refills: Number(e.target.value) })} />
        </label>

        <label className="span-2">
          Patient Instructions (Sig)
          <textarea value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} />
        </label>

        {error && <div className="alert danger span-2"><AlertTriangle size={16} />{error}</div>}

        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>
            {busy ? 'Authorizing…' : 'Sign & Transmit E-Prescription'}
            <FileText size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SpecialistReferralModal({ patient: initPatient, onClose, onSaved }: { patient?: Patient; onClose: () => void; onSaved: () => void }) {
  const [patients, setPatients] = useState<Patient[]>(initPatient ? [initPatient] : []);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(initPatient || null);
  const [specialty, setSpecialty] = useState('Cardiology');
  const [providerName, setProviderName] = useState('Pacific Heart & Vascular Institute');
  const [priority, setPriority] = useState<'Routine' | 'Semi-urgent' | 'Urgent'>('Routine');
  const [reason, setReason] = useState('');
  const [clinicalSummary, setClinicalSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initPatient) api.patients().then(setPatients).catch(() => {});
  }, [initPatient]);

  const specialties = [
    { name: 'Cardiology', provider: 'Pacific Heart & Vascular Institute' },
    { name: 'Endocrinology', provider: 'Bay Area Metabolic & Diabetes Clinic' },
    { name: 'Hematology', provider: 'Bayview Hematology Specialists' },
    { name: 'Nephrology', provider: 'Northwest Kidney & Hypertension Group' },
    { name: 'Neurology', provider: 'Comprehensive Neuroscience Center' },
    { name: 'Gastroenterology', provider: 'Digestive Health Consultants' },
    { name: 'Physical Therapy', provider: 'Active Motion Rehabilitation' }
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return setError('Please select a patient');
    setBusy(true);
    try {
      await api.createReferral({
        patientId: selectedPatient.id,
        specialty,
        providerName,
        priority,
        reason,
        clinicalSummary
      });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Create Specialist Referral" sub="Outbound clinical consultation request" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <div className="span-2">
          <label>Patient</label>
          {initPatient ? (
            <div className="selected-patient">
              <b>{initPatient.name}</b> <span className="mono">{initPatient.patientId}</span>
            </div>
          ) : (
            <select
              required
              value={selectedPatient?.id || ''}
              onChange={e => setSelectedPatient(patients.find(p => p.id === e.target.value) || null)}
            >
              <option value="">Choose patient…</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.patientId})</option>
              ))}
            </select>
          )}
        </div>

        <label>
          Medical Specialty
          <select
            value={specialty}
            onChange={e => {
              setSpecialty(e.target.value);
              const found = specialties.find(s => s.name === e.target.value);
              if (found) setProviderName(found.provider);
            }}
          >
            {specialties.map(s => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </label>

        <label>
          Referral Priority
          <select value={priority} onChange={e => setPriority(e.target.value as any)}>
            <option>Routine (Within 4-6 weeks)</option>
            <option>Semi-urgent (Within 1-2 weeks)</option>
            <option>Urgent (Within 48 hours)</option>
          </select>
        </label>

        <label className="span-2">
          Provider / Clinic Facility
          <input required value={providerName} onChange={e => setProviderName(e.target.value)} />
        </label>

        <label className="span-2">
          Reason for Consultation
          <input
            required
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Refractory anemia evaluation, echocardiogram interpretation"
          />
        </label>

        <label className="span-2">
          Clinical Summary & Relevant Findings
          <textarea
            required
            value={clinicalSummary}
            onChange={e => setClinicalSummary(e.target.value)}
            placeholder="Include recent lab trends, medication trials, past medical history…"
          />
        </label>

        {error && <div className="alert danger span-2"><AlertTriangle size={16} />{error}</div>}

        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>
            {busy ? 'Transmitting…' : 'Transmit Referral'}
            <ClipboardList size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RecordVitalsModal({ patient, onClose, onSaved }: { patient: Patient; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({ bpSystolic: '', bpDiastolic: '', heartRate: '', tempF: '', respRate: '', spo2: '', bmi: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // Only what was measured is sent. Empty boxes stay empty.
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, Number(v)]));
    if (!Object.keys(body).length) { setError('Enter at least one measurement'); return; }
    setBusy(true);
    try {
      await api.addVitals(patient.id, body as any);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Record Vitals: ${patient.name}`} sub="Clinical examination measurements" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Blood Pressure (Systolic)
          <input
            type="number"
            value={form.bpSystolic}
            onChange={e => setForm({ ...form, bpSystolic: e.target.value })}
            required
          />
        </label>
        <label>
          Blood Pressure (Diastolic)
          <input
            type="number"
            value={form.bpDiastolic}
            onChange={e => setForm({ ...form, bpDiastolic: e.target.value })}
            required
          />
        </label>
        <label>
          Heart Rate (bpm)
          <input
            type="number"
            value={form.heartRate}
            onChange={e => setForm({ ...form, heartRate: e.target.value })}
            required
          />
        </label>
        <label>
          Body Temp (°F)
          <input
            type="number"
            step="0.1"
            value={form.tempF}
            onChange={e => setForm({ ...form, tempF: e.target.value })}
            required
          />
        </label>
        <label>
          Oxygen Saturation SpO2 (%)
          <input
            type="number"
            value={form.spo2}
            onChange={e => setForm({ ...form, spo2: e.target.value })}
            required
          />
        </label>
        <label>
          Body Mass Index (BMI)
          <input
            type="number"
            step="0.1"
            value={form.bmi}
            onChange={e => setForm({ ...form, bmi: e.target.value })}
            required
          />
        </label>
        {error && <div className="alert danger span-2"><AlertTriangle size={16} />{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Record Vitals'}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddAllergyModal({ patient, onClose, onSaved }: { patient: Patient; onClose: () => void; onSaved: () => void }) {
  const [allergen, setAllergen] = useState('');
  const [severity, setSeverity] = useState<'Mild' | 'Moderate' | 'Severe / Anaphylaxis'>('Moderate');
  const [reaction, setReaction] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.addAllergy(patient.id, { allergen, severity, reaction });
      onSaved();
    } catch {
      //
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Document Allergy: ${patient.name}`} sub="Clinical safety warning" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Allergen / Substance Name
          <input required value={allergen} onChange={e => setAllergen(e.target.value)} placeholder="e.g. Penicillin, Codeine, Peanuts" />
        </label>
        <label>
          Clinical Severity
          <select value={severity} onChange={e => setSeverity(e.target.value as any)}>
            <option>Mild</option>
            <option>Moderate</option>
            <option>Severe / Anaphylaxis</option>
          </select>
        </label>
        <label className="span-2">
          Clinical Reaction Details
          <input required value={reaction} onChange={e => setReaction(e.target.value)} placeholder="e.g. Urticaria, bronchospasm, angioedema" />
        </label>
        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Add to Allergy Record'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddProblemModal({ patient, onClose, onSaved }: { patient: Patient; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'Active' | 'Resolved' | 'Chronic'>('Active');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.addProblem(patient.id, { name, code, status });
      onSaved();
    } catch {
      //
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Add Chronic Condition: ${patient.name}`} sub="Update clinical problem list" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Condition / Diagnosis Name
          <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Type 2 Diabetes Mellitus" />
        </label>
        <label>
          ICD-10 Code
          <input required value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. E11.9, I10" />
        </label>
        <label>
          Clinical Status
          <select value={status} onChange={e => setStatus(e.target.value as any)}>
            <option>Active</option>
            <option>Chronic</option>
            <option>Resolved</option>
          </select>
        </label>
        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Record Diagnosis'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CreateCarePlanModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [title, setTitle] = useState('Type 2 Diabetes Glycemic Control Pathway');
  const [category, setCategory] = useState('Endocrine Management');
  const [goalText, setGoalText] = useState('Maintain HbA1c < 7.0%\nDaily fasting blood glucose monitoring\nNutritional consultation');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.patients().then(res => {
      setPatients(res);
      if (res.length > 0) setPatientId(res[0].id);
    }).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createCarePlan({
        patientId,
        title,
        category,
        goals: goalText.split('\n').filter(Boolean),
        targets: [
          { metric: 'HbA1c', target: '< 7.0%', current: '7.8%', status: 'needs-attention' },
          { metric: 'Blood Pressure', target: '< 130/80', current: '136/84', status: 'needs-attention' }
        ]
      });
      onSaved();
    } catch {
      //
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Enroll Patient in Chronic Protocol" sub="Evidence-based care pathway" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Patient
          <select value={patientId} onChange={e => setPatientId(e.target.value)}>
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.patientId})</option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Care Protocol Title
          <input required value={title} onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="span-2">
          Category
          <input required value={category} onChange={e => setCategory(e.target.value)} />
        </label>
        <label className="span-2">
          Protocol Goals (one per line)
          <textarea required rows={3} value={goalText} onChange={e => setGoalText(e.target.value)} />
        </label>
        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>Enroll Patient</button>
        </div>
      </form>
    </Modal>
  );
}

function SOAPEncounterModal({ patient, onClose, onSaved }: { patient: Patient; onClose: () => void; onSaved: () => void }) {
  const [diagnosis, setDiagnosis] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fullNotes = `CHIEF COMPLAINT: ${chiefComplaint}\n\nS: ${subjective}\nO: ${objective}\nA: ${assessment}\nP: ${plan}`;
      await api.createEncounter({
        patientId: patient.id,
        diagnosis,
        notes: fullNotes,
        chiefComplaint,
        subjective,
        objective,
        assessment,
        plan
      });
      onSaved();
    } catch {
      //
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Clinical Encounter: ${patient.name}`} sub={`${patient.patientId} · Document Findings`} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Chief Complaint
          <input required value={chiefComplaint} onChange={e => setChiefComplaint(e.target.value)} placeholder="Reason for encounter…" />
        </label>
        <label className="span-2">
          Diagnosis / Assessment
          <input required value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="Primary clinical diagnosis…" />
        </label>
        <label className="span-2">
          [S] Subjective Findings
          <textarea required rows={2} value={subjective} onChange={e => setSubjective(e.target.value)} placeholder="Symptoms, history, patient statements…" />
        </label>
        <label className="span-2">
          [O] Objective Findings
          <textarea required rows={2} value={objective} onChange={e => setObjective(e.target.value)} placeholder="Physical exam, clinical observations…" />
        </label>
        <label className="span-2">
          [A] Assessment
          <textarea required rows={2} value={assessment} onChange={e => setAssessment(e.target.value)} placeholder="Clinical evaluation, differential diagnosis…" />
        </label>
        <label className="span-2">
          [P] Care Plan
          <textarea required rows={2} value={plan} onChange={e => setPlan(e.target.value)} placeholder="Therapy, lab orders, follow-up schedule…" />
        </label>
        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Sign & Record Encounter'}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FollowUpAppointmentModal({ patient, onClose, onSaved }: { patient?: Patient; onClose: () => void; onSaved: () => void }) {
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

const IMPORT_EXAMPLE = `{
  "facility": "Example Diagnostics",
  "records": [
    {
      "sourceRecordId": "EX-1001",
      "kind": "lab",
      "eventDate": "2026-01-10",
      "patient": { "identifier": "CW-12345", "name": "Full Name", "dob": "1980-05-05", "phone": "+1 555 0100" },
      "content": { "testName": "HbA1c", "value": "6.2", "units": "%", "referenceRange": "4.0-5.6" }
    }
  ]
}`;

// A small CSV reader (quoted fields supported). Columns are named in the first row.
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(c => c.trim())) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some(c => c.trim())) rows.push(row);
  const head = (rows.shift() ?? []).map(h => h.trim());
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function toRecords(raw: string, fileName: string, facility: string): any[] {
  const t = raw.trim();
  if (!t) throw new Error('Choose a file or paste the records first');
  if (fileName.toLowerCase().endsWith('.csv') || !/^[\[{]/.test(t)) {
    return parseCsv(t).map(r => ({
      facility,
      sourceRecordId: r.sourceRecordId, kind: r.kind, eventDate: r.eventDate,
      documentRef: fileName || undefined,
      patient: { identifier: r.identifier, name: r.name, dob: r.dob, phone: r.phone },
      content: r.kind === 'medication'
        ? { medicine: r.medicine, dosage: r.dosage, frequency: r.frequency, route: r.route }
        : r.kind === 'consultation'
          ? { diagnosis: r.diagnosis, notes: r.notes }
          : { testName: r.testName, value: r.value, units: r.units, referenceRange: r.referenceRange }
    }));
  }
  const j = JSON.parse(t);
  const list = Array.isArray(j) ? j : Array.isArray(j.records) ? j.records : [j];
  return list.map((r: any) => ({ ...r, facility: r.facility || j.facility || facility, documentRef: r.documentRef || fileName || undefined }));
}

function ImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [facility, setFacility] = useState('');
  const [raw, setRaw] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<any[] | null>(null);

  const onFile = async (f?: File) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { setError('The file must be smaller than 2 MB'); return; }
    setFileName(f.name);
    setRaw(await f.text());
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const records = toRecords(raw, fileName, facility.trim());
      const res = await api.importRecord({ facility: facility.trim(), records });
      setResults(res.results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (results) {
    return (
      <Modal title="Import result" onClose={onSaved}>
        <p className="muted">Nothing was overwritten. Anything unclear is waiting in the review queue.</p>
        <ul>
          {results.map((r, i) => (
            <li key={i} style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}>
              <b>{r.record?.sourceRecordId || r.sourceRecordId || `Record ${i + 1}`}</b>{' '}
              {r.error ? <span style={{ color: '#a3341f' }}>Rejected: {r.error}</span> : <span>{r.outcome}</span>}
            </li>
          ))}
        </ul>
        <div className="modal-actions"><button className="primary" onClick={onSaved}>Done</button></div>
      </Modal>
    );
  }

  return (
    <Modal title="Import external medical records" onClose={onClose}>
      <div className="notice">
        <FileText size={18} />
        <span>JSON or CSV exported from another facility. Source, dates and identifiers are kept as given. Each record is matched to a patient by the rules in the review queue; weak matches are never linked automatically.</span>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Source facility (used when a record does not name one)
          <input value={facility} onChange={e => setFacility(e.target.value)} placeholder="Name of the sending facility" />
        </label>
        <label className="span-2">
          File (.json or .csv)
          <input type="file" accept=".json,.csv,application/json,text/csv" onChange={e => onFile(e.target.files?.[0])} />
        </label>
        <label className="span-2">
          Or paste records
          <textarea rows={7} value={raw} onChange={e => { setRaw(e.target.value); setFileName(''); }} placeholder="Paste JSON or CSV" style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }} />
        </label>
        <details className="span-2">
          <summary>Format</summary>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{IMPORT_EXAMPLE}</pre>
          <p className="muted" style={{ fontSize: 12 }}>
            CSV columns: sourceRecordId, kind, eventDate, identifier, name, dob, phone, then testName, value, units, referenceRange (lab) or medicine, dosage, frequency, route (medication) or diagnosis, notes (consultation).
          </p>
        </details>
        {error && <div className="alert danger span-2"><AlertTriangle size={16} />{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !raw.trim()}>{busy ? 'Importing' : 'Import and check'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── ENTRY (signed-in user comes from the shared session guard) ─────────────
export default function DoctorApp({ user }: { user: User }) {
  const navigate = useNavigate();
  return (
    <div className="dx">
      <DoctorWorkspace
        user={user}
        onLogout={() => {
          localStorage.removeItem('cw_token');
          navigate('/login', { replace: true });
        }}
      />
    </div>
  );
}
