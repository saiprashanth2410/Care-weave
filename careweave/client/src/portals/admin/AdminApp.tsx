import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession, type SessionUser } from '@/auth/session';
import { initials } from '../doctor/helpers';
import PortalBoundary from '../doctor/PortalBoundary';
import '../doctor/styles.css';
import { AuditLog } from './AuditLog';
import { StaffAccess } from './StaffAccess';

const NAV: [string, string][] = [
  ['staff', 'Staff & Access'],
  ['audit', 'Audit Log'],
];

/** The administrator portal: accounts, roles and the audit log. No patient records are reachable from here. */
export default function AdminApp({ user }: { user: SessionUser }) {
  const navigate = useNavigate();
  const [section, setSection] = useState('staff');
  const [toast, setToast] = useState('');
  const notify = useCallback((s: string) => {
    setToast(s);
    setTimeout(() => setToast(''), 3500);
  }, []);

  return (
    <div className="dx">
      <div className="app-shell">
        <aside className="sidebar">
          <div className="side-brand">
            <img src="/careweave-mark.png" alt="" className="brand-logo" />
            <span>CareWeave</span>
          </div>
          <nav>
            {NAV.filter(([id]) => id !== 'audit' || user.permissions?.includes('audit')).map(([id, label]) => (
              <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}><span>{label}</span></button>
            ))}
          </nav>
          <div className="side-bottom">
            <div className="side-user-chip">
              <div className="avatar small" style={{ background: '#0c6b6d', color: '#f6f7f3' }}>{initials(user.name)}</div>
              <div><b>{user.name}</b><small>{user.facility}</small></div>
            </div>
            <button className="logout" onClick={() => { clearSession(); navigate('/login', { replace: true }); }}><span>Sign out</span></button>
          </div>
        </aside>
        <main className="main">
          <header className="topbar">
            <div className="breadcrumb"><span>Admin Portal</span><span className="crumb-sep">/</span><b>{NAV.find(n => n[0] === section)?.[1]}</b></div>
          </header>
          <div className="content">
            <PortalBoundary key={section}>
              {section === 'staff' && user.permissions?.includes('staff') && <StaffAccess selfId={user.id} notify={notify} />}
              {section === 'audit' && user.permissions?.includes('audit') && <AuditLog notify={notify} />}
            </PortalBoundary>
          </div>
        </main>
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
