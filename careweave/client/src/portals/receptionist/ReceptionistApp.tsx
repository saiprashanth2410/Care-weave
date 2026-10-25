import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  AlertCircle, AlertTriangle, ArrowRight, Ban, Calendar,
  CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, ClockIcon,
  LayoutDashboard, LogOut, Mail, Menu, Pencil, Phone,
  Plus, RefreshCw, Search, ShieldCheck, Stethoscope, UserCheck,
  UserPlus, Users, X
} from './icons';
import { Link, useNavigate } from 'react-router-dom';
import { api } from './api';
import SampleScenario from '@/components/SampleScenario';
import OPTokenPrintModal from './components/OPTokenPrintModal';
import DoctorSlotMatrix from './components/DoctorSlotMatrix';
import type { ExtractedReceptionData, AdminPatientRecord, Appointment, Dashboard, Doctor, Patient, User } from './types';
import './styles.css';

// ─── UTILITIES & HELPERS ───────────────────────────────────────────────────
function getDoctorRoom(doctorName?: string): string {
  const d = (doctorName || '').toLowerCase();
  if (d.includes('laha') || d.includes('anirban')) return 'Room 4';
  if (d.includes('iyer') || d.includes('rajesh')) return 'Room 2';
  if (d.includes('priya') || d.includes('sharma')) return 'Room 1';
  if (d.includes('patil') || d.includes('sneha')) return 'Room 3';
  if (d.includes('vikram') || d.includes('seth')) return 'ICU Block B';
  if (d.includes('meenakshi') || d.includes('sundaram')) return 'Room 5';
  return 'Room 4';
}
const fmtDate = (v?: string) =>
  v ? new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const fmtTime = (v?: string) =>
  v ? new Date(v).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';

const initials = (n: string) =>
  (n || 'Patient').split(' ').map(v => v[0]).slice(0, 2).join('').toUpperCase();

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function calculateAge(dob?: string): string {
  if (!dob) return '';
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return `${age} yrs`;
}

function waitDuration(checkedInAt?: string): string {
  if (!checkedInAt) return '—';
  const ms = Math.max(0, Date.now() - new Date(checkedInAt).getTime());
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function waitUrgency(checkedInAt?: string): 'low' | 'med' | 'urgent' {
  if (!checkedInAt) return 'low';
  const mins = Math.floor((Date.now() - new Date(checkedInAt).getTime()) / 60000);
  if (mins >= 30) return 'urgent';
  if (mins >= 15) return 'med';
  return 'low';
}

// ─── APP ROOT ───────────────────────────────────────────────────────────────
function App({ user }: { user: User }) {
  const navigate = useNavigate();
  return (
    <Workspace
      user={user}
      onLogout={() => {
        localStorage.removeItem('cw_token');
        navigate('/login', { replace: true });
      }}
    />
  );
}

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [section, setSection] = useState<'overview' | 'queue' | 'appointments' | 'patients' | 'doctors'>('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [toast, setToast] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  // Global modals triggered from header / quick buttons
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [registeredPatientToBook, setRegisteredPatientToBook] = useState<Patient | null>(null);

  // New Clinical Reception Features
  const [printAppointment, setPrintAppointment] = useState<Appointment | null>(null);
  const [printTokenIndex, setPrintTokenIndex] = useState(1);
  const [prefilledPatient, setPrefilledPatient] = useState<ExtractedReceptionData | null>(null);

  const handlePrintToken = (appt: Appointment, idx = 1) => {
    setPrintAppointment(appt);
    setPrintTokenIndex(idx);
  };

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'queue', label: 'Live OPD Queue', icon: Clock3 },
    { id: 'doctors', label: 'Doctor Roster & Slots', icon: Stethoscope },
    { id: 'appointments', label: 'Appointments', icon: CalendarDays },
    { id: 'patients', label: 'Patient Directory', icon: Users },
  ];

  return (
    <div className={`app-shell ${collapsed ? 'nav-collapsed' : ''}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="side-brand">
          <img src="/careweave-mark.png" alt="" className="brand-logo" />
          <span>CareWeave</span>
        </div>

        <span className="nav-section-title">Front Desk Operations</span>
        <nav>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = section === item.id;
            return (
              <button
                key={item.id}
                className={isActive ? 'active' : ''}
                onClick={() => setSection(item.id as any)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="side-bottom">
          <div className="privacy-card">
            <ShieldCheck size={16} />
            <div>
              <strong>Administrative Scope</strong>
              <small>Clinical notes and lab values partitioned</small>
            </div>
          </div>

          <div className="side-user-chip">
            <div className="avatar small">{initials(user.name)}</div>
            <div>
              <b>{user.name}</b>
              <small>{user.facility}</small>
            </div>
          </div>

          <button className="logout-btn" onClick={onLogout} title="Sign out">
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main">
        <header className="topbar">
          <button
            className="icon-btn top-menu-button"
            onClick={() => setCollapsed(!collapsed)}
            title="Toggle sidebar"
          >
            <Menu size={19} />
          </button>

          <div className="breadcrumb">
            <span>Reception Desk</span>
            <span className="crumb-sep">/</span>
            <b>{navItems.find(n => n.id === section)?.label}</b>
          </div>

          <div className="topbar-center">
            <div className="live-badge">
              <span className="pulse"></span>
              <span>{currentTime} · {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            </div>

            <SampleScenario className="btn-soft" />

            <Link
              to="/analytics"
              className="btn-soft"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#0f766e', borderColor: '#0f766e' }}
              title="Open Exasol Hospital Analytics Dashboard"
            >
              <span>Exasol Analytics</span>
            </Link>

            <Link
              to="/lab/overview"
              className="btn-soft"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
              title="Open Laboratory & Diagnostic Reports"
            >
              <span>Laboratory portal</span>
            </Link>


            <button
              className="btn-soft"
              onClick={() => setShowAppointmentModal(true)}
            >
              <CalendarDays size={14} />
              <span>Book Appointment</span>
            </button>

            <button
              className="btn-primary"
              onClick={() => setShowRegisterModal(true)}
            >
              <UserPlus size={15} />
              <span>Register Patient</span>
            </button>

            <button
              className="icon-btn"
              onClick={() => { setRefresh(r => r + 1); notify('Workspace refreshed'); }}
              title="Refresh data"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>

        <div className="content">
          {section === 'overview' && (
            <OverviewSection
              user={user}
              refresh={refresh}
              go={setSection}
              notify={notify}
              onRegister={() => setShowRegisterModal(true)}
              onBook={() => setShowAppointmentModal(true)}
              onPrintToken={handlePrintToken}
            />
          )}

          {section === 'queue' && (
            <QueueSection
              refresh={refresh}
              notify={notify}
              onBook={() => setShowAppointmentModal(true)}
              onPrintToken={handlePrintToken}
            />
          )}

          {section === 'doctors' && (
            <div className="card" style={{ padding: 20 }}>
              <DoctorSlotMatrix
                onSelectDoctorForBooking={(docName) => {
                  setRegisteredPatientToBook(null);
                  setShowAppointmentModal(true);
                  notify(`Booking consultation for ${docName}`);
                }}
              />
            </div>
          )}

          {section === 'appointments' && (
            <AppointmentsSection
              refresh={refresh}
              notify={notify}
              onNewAppointment={() => setShowAppointmentModal(true)}
            />
          )}

          {section === 'patients' && (
            <PatientsSection
              refresh={refresh}
              notify={notify}
              onRegister={() => setShowRegisterModal(true)}
              onBookForPatient={p => {
                setRegisteredPatientToBook(p);
                setShowAppointmentModal(true);
              }}
            />
          )}
        </div>
      </main>

      {/* Global Modals */}
      {showRegisterModal && (
        <PatientRegistrationModal
          initialData={prefilledPatient}
          onClose={() => {
            setShowRegisterModal(false);
            setPrefilledPatient(null);
          }}
          onSaved={p => {
            setShowRegisterModal(false);
            setPrefilledPatient(null);
            setRefresh(r => r + 1);
            notify(`Patient ${p.name} registered with ID ${p.patientId}`);
          }}
          onBookAppt={p => {
            setShowRegisterModal(false);
            setPrefilledPatient(null);
            setRegisteredPatientToBook(p);
            setShowAppointmentModal(true);
          }}
        />
      )}

      {showAppointmentModal && (
        <AppointmentModal
          patient={registeredPatientToBook || undefined}
          onClose={() => {
            setShowAppointmentModal(false);
            setRegisteredPatientToBook(null);
          }}
          onSaved={() => {
            setShowAppointmentModal(false);
            setRegisteredPatientToBook(null);
            setRefresh(r => r + 1);
            notify('Appointment scheduled successfully');
          }}
        />
      )}


      {printAppointment && (
        <OPTokenPrintModal
          appointment={printAppointment}
          tokenIndex={printTokenIndex}
          roomNumber={getDoctorRoom(printAppointment.doctorName)}
          onClose={() => setPrintAppointment(null)}
        />
      )}

      {toast && (
        <div className="toast">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

// ─── RECEPTIONIST: OVERVIEW COMMAND CENTER ──────────────────────────────────
function OverviewSection({
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
      await api.updateAppointment(a.id, { status: 'Checked In' });
      notify(`${a.patientName} checked in. Opening token slip.`);
      onPrintToken?.(a, 1);
      loadData();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const handleCallIn = async (a: Appointment) => {
    try {
      await api.updateAppointment(a.id, { status: 'In Consultation' });
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

// ─── RECEPTIONIST: LIVE PATIENT QUEUE (WAITING ROOM MANAGER) ────────────────
function QueueSection({
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
      await api.updateAppointment(a.id, { status });
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

// ─── RECEPTIONIST: APPOINTMENTS SCHEDULER ────────────────────────────────────
function AppointmentsSection({
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
      await api.updateAppointment(a.id, { status });
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

// ─── RECEPTIONIST: PATIENT DIRECTORY ────────────────────────────────────────
function PatientsSection({
  refresh,
  notify,
  onRegister,
  onBookForPatient
}: {
  refresh: number;
  notify: (s: string) => void;
  onRegister: () => void;
  onBookForPatient: (p: Patient) => void;
}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);

  const loadPatients = useCallback(() => {
    api.patients(q)
      .then(setPatients)
      .catch(e => notify(e.message));
  }, [q, notify]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPatients();
    }, 150);
    return () => clearTimeout(timer);
  }, [loadPatients, refresh]);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">PATIENT ADMINISTRATION</p>
          <h1>Patient Directory</h1>
          <p className="muted">
            Search patient records, update contact demographics, and view administrative history.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={onRegister}>
            <Plus size={16} />
            <span>New Patient</span>
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search" style={{ minWidth: 360 }}>
          <Search size={16} />
          <input
            placeholder="Search by patient ID (CW-XXXXX), name, phone, or email…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          {q && (
            <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => setQ('')}>
              <X size={14} />
            </button>
          )}
        </div>
        <span className="muted" style={{ fontSize: 13 }}>
          {patients.length} registered patient{patients.length !== 1 ? 's' : ''} in directory
        </span>
      </div>

      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Patient Name</th>
              <th>CareWeave ID</th>
              <th>Date of Birth & Age</th>
              <th>Phone Number</th>
              <th>Email</th>
              <th>Emergency Contact</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {patients.map(p => (
              <tr key={p.id}>
                <td>
                  <div className="person">
                    <div className="avatar small">{initials(p.name)}</div>
                    <div>
                      <b>{p.name}</b>
                      {p.risk && <small style={{ color: '#d97706' }}>{p.risk}</small>}
                    </div>
                  </div>
                </td>
                <td>
                  <span className="mono" style={{ fontWeight: 600 }}>{p.patientId}</span>
                </td>
                <td>
                  <span>{fmtDate(p.dob)}</span>
                  <small style={{ color: 'var(--slate-400)', display: 'block', fontSize: 11 }}>
                    {calculateAge(p.dob)}
                  </small>
                </td>
                <td>{p.phone}</td>
                <td>{p.email || '—'}</td>
                <td>
                  <span style={{ fontSize: 12 }}>{p.emergencyContact || '—'}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                    <button
                      className="btn-soft small-btn"
                      onClick={() => onBookForPatient(p)}
                      title="Schedule appointment"
                    >
                      <CalendarDays size={13} />
                      <span>Book</span>
                    </button>

                    <button
                      className="icon-btn"
                      onClick={() => setEditPatient(p)}
                      title="Edit demographic contact details"
                    >
                      <Pencil size={14} />
                    </button>

                    <button
                      className="icon-btn"
                      onClick={() => setSelectedPatient(p)}
                      title="View administrative profile drawer"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {patients.length === 0 && (
          <div className="empty">
            <Users size={32} />
            <b>No patients found matching your search</b>
            <span>Double check the patient ID or register a new patient file.</span>
          </div>
        )}
      </div>

      {selectedPatient && (
        <PatientDrawer
          patient={selectedPatient}
          onClose={() => setSelectedPatient(null)}
          onBookAppt={p => {
            setSelectedPatient(null);
            onBookForPatient(p);
          }}
          onEditPatient={p => {
            setSelectedPatient(null);
            setEditPatient(p);
          }}
        />
      )}

      {editPatient && (
        <EditPatientModal
          patient={editPatient}
          onClose={() => setEditPatient(null)}
          onSaved={updated => {
            setEditPatient(null);
            setPatients(prev => prev.map(p => (p.id === updated.id ? updated : p)));
            notify('Patient demographic details updated successfully');
          }}
        />
      )}
    </>
  );
}

// ─── PATIENT DRAWER (ADMINISTRATIVE FILE) ───────────────────────────────────
function PatientDrawer({
  patient,
  onClose,
  onBookAppt,
  onEditPatient
}: {
  patient: Patient;
  onClose: () => void;
  onBookAppt: (p: Patient) => void;
  onEditPatient: (p: Patient) => void;
}) {
  const [record, setRecord] = useState<AdminPatientRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.patientAdmin(patient.id)
      .then(setRecord)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patient]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <button className="drawer-close" onClick={onClose}>
          <X size={18} />
        </button>

        <div className="drawer-hero">
          <div className="avatar large">{initials(patient.name)}</div>
          <div>
            <p className="eyebrow" style={{ marginBottom: 2 }}>{patient.patientId}</p>
            <h2>{patient.name}</h2>
            <span className="muted">
              DOB: {fmtDate(patient.dob)} ({calculateAge(patient.dob)})
            </span>
          </div>
        </div>

        <div className="notice" style={{ marginBottom: 18 }}>
          <ShieldCheck size={18} />
          <div>
            <strong>Administrative File Scope</strong>
            <p style={{ margin: 0, fontSize: 11 }}>
              Clinical notes, test orders, and prescriptions are protected.
              Front desk access is limited to scheduling and demographic details.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button className="btn-primary" style={{ flex: 1 }} onClick={() => onBookAppt(patient)}>
            <CalendarDays size={15} />
            <span>Book Appointment</span>
          </button>
          <button className="btn-secondary" onClick={() => onEditPatient(patient)}>
            <Pencil size={15} />
            <span>Edit</span>
          </button>
        </div>

        <div className="drawer-field">
          <Phone size={15} />
          <span>Phone: <strong>{patient.phone}</strong></span>
        </div>

        {patient.email && (
          <div className="drawer-field">
            <Mail size={15} />
            <span>Email: <strong>{patient.email}</strong></span>
          </div>
        )}

        {patient.emergencyContact && (
          <div className="drawer-field">
            <AlertCircle size={15} />
            <span>Emergency: <strong>{patient.emergencyContact}</strong></span>
          </div>
        )}

        <div className="section-label">Appointment History</div>
        {loading ? (
          <p className="muted" style={{ fontSize: 12 }}>Loading appointment history…</p>
        ) : !record?.appointments || record.appointments.length === 0 ? (
          <p className="muted" style={{ fontSize: 12 }}>No appointment history on file.</p>
        ) : (
          <div className="appt-list">
            {record.appointments.map(a => (
              <div className="appt-row" key={a.id}>
                <div>
                  <b>{a.date} · {a.time}</b>
                  <span>{a.reason} {a.doctorName ? `· ${a.doctorName}` : ''}</span>
                </div>
                <span className={`status ${a.status.toLowerCase().replace(/\s+/g, '-')}`}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Central Lab Diagnostics & Reports */}
        <div className="section-label" style={{ marginTop: 20 }}>
          Central Laboratory & Diagnostics
        </div>
        {loading ? (
          <p className="muted" style={{ fontSize: 12 }}>Checking laboratory requisitions…</p>
        ) : !record?.labOrders || record.labOrders.length === 0 ? (
          <div style={{ border: '1px solid var(--border-subtle)', padding: 12, borderRadius: 4, background: 'var(--bg-surface)' }}>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>No lab investigations ordered for this patient yet.</p>
            <Link
              to={`/lab/orders?order=new`}
              className="btn-primary"
              style={{ marginTop: 8, fontSize: 11, padding: '5px 12px', textDecoration: 'none', display: 'inline-flex' }}
            >
              + Send for Lab Requisition
            </Link>
          </div>
        ) : (
          <div className="appt-list">
            {record.labOrders.map((order: any) => (
              <div className="appt-row" key={order.id} style={{ alignItems: 'flex-start' }}>
                <div>
                  <b>{order.testName}</b>
                  <p className="mono" style={{ margin: '2px 0 0' }}>
                    Requisition: {order.id} · {order.department || 'Diagnostics'}
                  </p>
                  <p className="muted" style={{ margin: 0, fontSize: 11 }}>
                    Ordered: {order.orderedAt ? new Date(order.orderedAt).toLocaleDateString() : 'Today'} · Ref: {order.orderingDoctor}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`status ${order.status.toLowerCase().replace(/_/g, '-')}`}>
                    {order.status.replace(/_/g, ' ')}
                  </span>
                  <Link
                    to={`/lab/orders?order=${order.id}`}
                    style={{ display: 'block', fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginTop: 4, textDecoration: 'underline' }}
                  >
                    View in Lab →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PATIENT REGISTRATION MODAL ─────────────────────────────────────────────
function PatientRegistrationModal({
  initialData,
  onClose,
  onSaved,
  onBookAppt
}: {
  initialData?: ExtractedReceptionData | null;
  onClose: () => void;
  onSaved: (p: Patient) => void;
  onBookAppt: (p: Patient) => void;
}) {
  const [form, setForm] = useState({
    name: initialData?.name || '',
    dob: initialData?.dob || '',
    phone: initialData?.phone || '',
    email: '',
    emergencyContact: initialData?.emergencyContact || ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState<Patient[]>([]);
  const [liveMatches, setLiveMatches] = useState<Patient[]>([]);

  // Smart Live Duplicate Check while typing
  useEffect(() => {
    const q = (form.phone.trim().length > 5 ? form.phone.trim() : form.name.trim().length > 3 ? form.name.trim() : '');
    if (!q) {
      setLiveMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      api.patients(q).then((res) => {
        const matches = res.filter(p =>
          (form.phone && p.phone === form.phone) ||
          (form.name && p.name.toLowerCase() === form.name.toLowerCase())
        );
        setLiveMatches(matches);
      }).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [form.name, form.phone]);

  const update = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDuplicates([]);
    try {
      const res = await api.createPatient(form);
      try {
        const cached = JSON.parse(localStorage.getItem('cw_registered_patients') || '[]');
        localStorage.setItem(
          'cw_registered_patients',
          JSON.stringify([res, ...cached.filter((x: any) => x.patientId !== res.patientId)])
        );
      } catch {}
      onSaved(res);
    } catch (err: any) {
      if (err.message?.includes('duplicate') || err.message?.includes('Duplicate')) {
        try {
          const matches = await api.patients(form.name);
          const likely = matches.filter(p => p.dob === form.dob);
          if (likely.length > 0) {
            setDuplicates(likely);
            setBusy(false);
            return;
          }
        } catch {}
      }
      setError(err.message || 'Failed to create patient record');
    } finally {
      setBusy(false);
    }
  };

  if (duplicates.length > 0) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2>Possible Duplicate Patient</h2>
              <p className="muted">An existing patient with the same name and date of birth was found.</p>
            </div>
            <button className="icon-btn" onClick={onClose}><X size={18} /></button>
          </div>

          <div className="alert warning" style={{ marginBottom: 14 }}>
            <AlertCircle size={16} />
            <span>Please verify with the patient before creating duplicate medical identities.</span>
          </div>

          {duplicates.map(p => (
            <div className="duplicate-card" key={p.id}>
              <div className="person">
                <div className="avatar">{initials(p.name)}</div>
                <div>
                  <b>{p.name}</b>
                  <span className="mono">{p.patientId}</span>
                  <small>DOB: {fmtDate(p.dob)} · Phone: {p.phone}</small>
                </div>
              </div>
              <div className="duplicate-actions">
                <button className="btn-secondary" onClick={() => onBookAppt(p)}>
                  Book for this Patient
                </button>
                <button className="btn-primary" onClick={onClose}>
                  Use Existing File
                </button>
              </div>
            </div>
          ))}

          <div className="modal-actions">
            <button className="btn-secondary" onClick={() => setDuplicates([])}>
              ← Back to Registration
            </button>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await fetch('/api/patients', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${localStorage.getItem('cw_token')}`
                    },
                    body: JSON.stringify({ ...form, _forceCreate: true, risk: 'Reviewed duplicate override' })
                  });
                  const body = await res.json();
                  if (!res.ok) throw new Error(body.error);
                  onSaved(body);
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Creating…' : 'Register as New Patient Anyway'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Register New Patient</h2>
            <p className="muted">Enter demographic info. A unique CareWeave ID will be generated.</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form className="form-grid" onSubmit={submit}>
          {liveMatches.length > 0 && (
            <div className="alert warning span-2" style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <strong style={{ display: 'block' }}>⚠️ Existing Patient Record Detected ({liveMatches.length} match)</strong>
                <p style={{ margin: '2px 0 6px', fontSize: 12 }}>
                  "{liveMatches[0].name}" · UHID: <span className="mono font-bold">{liveMatches[0].patientId}</span> · Phone: {liveMatches[0].phone}
                </p>
                <button
                  type="button"
                  className="btn-secondary small-btn"
                  onClick={() => onBookAppt(liveMatches[0])}
                >
                  Use Existing File & Book Appointment →
                </button>
              </div>
            </div>
          )}

          <label className="span-2">
            Full Legal Name
            <input
              required
              value={form.name}
              onChange={update('name')}
              placeholder="e.g. Eleanor Vance"
            />
          </label>

          <label>
            Date of Birth
            <input
              required
              type="date"
              value={form.dob}
              onChange={update('dob')}
              max={todayISO()}
            />
          </label>

          <label>
            Contact Phone Number
            <input
              required
              value={form.phone}
              onChange={update('phone')}
              placeholder="+1 (555) 000-0000"
            />
          </label>

          <label className="span-2">
            Email Address <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
            <input
              type="email"
              value={form.email}
              onChange={update('email')}
              placeholder="patient@example.com"
            />
          </label>

          <label className="span-2">
            Emergency Contact <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
            <input
              value={form.emergencyContact}
              onChange={update('emergencyContact')}
              placeholder="Name · Relationship · Phone"
            />
          </label>

          {error && (
            <div className="alert danger span-2">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="notice span-2">
            <ShieldCheck size={16} />
            <span>Date of birth is immutable once registered to protect patient identity integrity.</span>
          </div>

          <div className="modal-actions span-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" disabled={busy}>
              {busy ? 'Registering…' : 'Complete Registration'}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── EDIT PATIENT DEMOGRAPHICS MODAL ───────────────────────────────────────
function EditPatientModal({
  patient,
  onClose,
  onSaved
}: {
  patient: Patient;
  onClose: () => void;
  onSaved: (p: Patient) => void;
}) {
  const [form, setForm] = useState({
    name: patient.name,
    phone: patient.phone,
    email: patient.email || '',
    emergencyContact: patient.emergencyContact || ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const update = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // rev lets the server refuse the save if someone else changed this patient while the form was open.
      const res = await api.updatePatient(patient.id, { ...form, rev: patient.rev ?? 0 });
      onSaved(res);
    } catch (e: any) {
      setError(e.message || 'Failed to update demographics');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Edit Contact Demographics</h2>
            <p className="muted">{patient.name} · {patient.patientId}</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="notice" style={{ marginBottom: 14 }}>
          <ShieldCheck size={16} />
          <span>Date of birth ({fmtDate(patient.dob)}) is protected against arbitrary changes.</span>
        </div>

        <form className="form-grid" onSubmit={submit}>
          <label className="span-2">
            Full Name
            <input required value={form.name} onChange={update('name')} />
          </label>

          <label>
            Phone Number
            <input required value={form.phone} onChange={update('phone')} />
          </label>

          <label>
            Email Address
            <input type="email" value={form.email} onChange={update('email')} />
          </label>

          <label className="span-2">
            Emergency Contact
            <input value={form.emergencyContact} onChange={update('emergencyContact')} />
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
              {busy ? 'Saving…' : 'Save Demographic Changes'}
              <Check size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── APPOINTMENT BOOKING MODAL ──────────────────────────────────────────────
function AppointmentModal({
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

// ─── RESCHEDULE APPOINTMENT MODAL ──────────────────────────────────────────
function RescheduleModal({
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
      await api.updateAppointment(appointment.id, { date, time, reason });
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

// ─── EXPORT RECEPTIONIST PORTAL ───────────────────────────────────────────
export default function ReceptionistApp({ user }: { user: User }) {
  return (
    <div className="rx">
      <App user={user} />
    </div>
  );
}
