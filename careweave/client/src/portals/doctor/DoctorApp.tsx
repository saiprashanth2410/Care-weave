import { useEffect, useState } from 'react';
import { Activity, CalendarDays, Check, ClipboardList, FileText, FlaskConical, HeartPulse, LayoutDashboard, LogOut, Menu, RefreshCw, Stethoscope, Users } from './icons';
import { api } from './api';
import type { Patient, User } from './types';
import { useNavigate, Link } from 'react-router-dom';
import { initials } from './helpers';
import { DoctorOverview } from './pages/DoctorOverview';
import { DoctorAppointments } from './pages/DoctorAppointments';
import { DoctorPatientRecords } from './pages/DoctorPatientRecords';
import { DoctorConsultations } from './pages/DoctorConsultations';
import { DoctorLabsAndDiagnostics } from './pages/DoctorLabsAndDiagnostics';
import { DoctorPrescriptions } from './pages/DoctorPrescriptions';
import { DoctorCarePlans } from './pages/DoctorCarePlans';
import { DoctorReferrals } from './pages/DoctorReferrals';
import { DoctorClinicalCalculators } from './pages/DoctorClinicalCalculators';
import { DoctorReconciliation } from './pages/DoctorReconciliation';
import { OrderLabModal } from './modals/OrderLabModal';
import { PrescribeModal } from './modals/PrescribeModal';
import { SpecialistReferralModal } from './modals/SpecialistReferralModal';
import { SOAPEncounterModal } from './modals/SOAPEncounterModal';
import { FollowUpAppointmentModal } from './modals/FollowUpAppointmentModal';
import PortalBoundary from './PortalBoundary';
import SampleScenario from '@/components/SampleScenario';
import './styles.css';

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
          <img src="/careweave-mark.png" alt="" className="brand-logo" />
          <span>CareWeave</span>
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
          <button className="icon-button menu-button top-menu-button" onClick={() => setCollapsed(!collapsed)}>
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Doctor Portal</span>
            <span className="crumb-sep">/</span>
            <b>{nav.find(n => n[0] === section)?.[1]}</b>
          </div>

          <div className="top-actions">
            <SampleScenario className="action-pill" />
            <Link
              to="/analytics"
              className="action-pill"
              style={{ textDecoration: 'none', color: '#0c6b6d', borderColor: '#0c6b6d', fontWeight: 600 }}
              title="Exasol Healthcare Analytics Dashboard"
            >
              Exasol Analytics
            </Link>
            <button
              className="icon-button"
              onClick={() => { setRefresh(v => v + 1); notify('Clinical data refreshed'); }}
              title="Refresh Workspace"
            >
              <RefreshCw size={17} />
            </button>
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
