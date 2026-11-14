import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession, type SessionUser } from '@/auth/session';
import { useLiveRefresh } from '../../useLiveRefresh';
import { initials } from '../doctor/helpers';
import PortalBoundary from '../doctor/PortalBoundary';
import '../doctor/styles.css';
import { adminApi } from './api';
import { AuditLog } from './AuditLog';
import { Inbox } from './Inbox';
import { StaffAccess } from './StaffAccess';

const NAV: [string, string][] = [
  ['inbox', 'Inbox'],
  ['staff', 'Staff & Access'],
  ['audit', 'Audit Log'],
];

/** The administrator portal: staff messages, accounts, roles and the audit log. No patient records are reachable from here. */
export default function AdminApp({ user }: { user: SessionUser }) {
  const navigate = useNavigate();
  const [section, setSection] = useState('staff');
  const [toast, setToast] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [unread, setUnread] = useState(0);
  const [firebase, setFirebase] = useState(false); // reset links need Firebase account management on the server
  const notify = useCallback((s: string) => {
    setToast(s);
    setTimeout(() => setToast(''), 3500);
  }, []);

  // A message sent while this page is open shows up (and the badge changes) without a reload.
  useLiveRefresh(() => setRefresh(r => r + 1));
  const loadUnread = useCallback(() => { adminApi.inboxSummary().then(r => setUnread(r.new)).catch(() => {}); }, []);
  useEffect(() => { loadUnread(); }, [loadUnread, refresh]);
  useEffect(() => { adminApi.catalog().then(c => setFirebase(c.firebase)).catch(() => {}); }, []);

  const allowed = (id: string) => (id === 'audit' ? user.permissions?.includes('audit') : id === 'staff' || id === 'inbox' ? user.permissions?.includes('staff') : true);

  return (
    <div className="dx">
      <div className="app-shell">
        <aside className="sidebar">
          <div className="side-brand">
            <img src="/careweave-mark-transparent.png" alt="" className="brand-logo" />
            <span>CareWeave</span>
          </div>
          <nav>
            {NAV.filter(([id]) => allowed(id)).map(([id, label]) => (
              <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>
                <span>{label}</span>
                {id === 'inbox' && unread > 0 && <span className="nav-count" aria-label={`${unread} unread`}>{unread}</span>}
              </button>
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
              {section === 'inbox' && allowed('inbox') && <Inbox notify={notify} refresh={refresh} canSendLinks={firebase} onChanged={loadUnread} />}
              {section === 'staff' && allowed('staff') && <StaffAccess selfId={user.id} notify={notify} />}
              {section === 'audit' && allowed('audit') && <AuditLog notify={notify} />}
            </PortalBoundary>
          </div>
        </main>
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
