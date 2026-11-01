import { clearSession } from '@/auth/session';
import { useEffect, useState } from 'react';
import { useLiveRefresh } from '@/useLiveRefresh';
import { CalendarDays, CheckCircle2, Clock3, LayoutDashboard, LogOut, Menu, RefreshCw, ShieldCheck, Stethoscope, UserPlus, Users } from './icons';
import { Link, useNavigate } from 'react-router-dom';
import SampleScenario from '@/components/SampleScenario';
import OPTokenPrintModal from './components/OPTokenPrintModal';
import DoctorSlotMatrix from './components/DoctorSlotMatrix';
import type { ExtractedReceptionData, Appointment, Patient, User } from './types';
import { getDoctorRoom, initials } from './helpers';
import OverviewSection from './sections/OverviewSection';
import QueueSection from './sections/QueueSection';
import AppointmentsSection from './sections/AppointmentsSection';
import PatientsSection from './sections/PatientsSection';
import PatientRegistrationModal from './modals/PatientRegistrationModal';
import AppointmentModal from './modals/AppointmentModal';
import './styles.css';

// ─── APP ROOT ───────────────────────────────────────────────────────────────
function App({ user }: { user: User }) {
  const navigate = useNavigate();
  return (
    <Workspace
      user={user}
      onLogout={() => {
        clearSession();
        navigate('/login', { replace: true });
      }}
    />
  );
}

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [section, setSection] = useState<'overview' | 'queue' | 'appointments' | 'patients' | 'doctors'>('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useLiveRefresh(() => setRefresh(r => r + 1));
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

// ─── EXPORT RECEPTIONIST PORTAL ───────────────────────────────────────────
export default function ReceptionistApp({ user }: { user: User }) {
  return (
    <div className="rx">
      <App user={user} />
    </div>
  );
}
