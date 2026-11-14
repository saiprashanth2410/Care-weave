import { useCallback, useEffect, useState } from 'react';
import { adminApi, type Catalog, type Created, type Staff, type StaffRole } from './api';
import { Modal, PageHeader } from '../doctor/components';

type Draft = { name: string; email: string; role: StaffRole; facility: string; permissions: string[]; password: string; room: string; shiftStart: string; shiftEnd: string };
const blank = (c: Catalog): Draft => ({ name: '', email: '', role: 'receptionist', facility: '', permissions: c.defaults.receptionist, password: '', room: '', shiftStart: '08:30', shiftEnd: '16:30' });

function StaffForm({ catalog, initial, self, existing, onClose, onSaved, notify }: {
  catalog: Catalog; initial: Draft; self: boolean; existing?: Staff; onClose: () => void; onSaved: (created?: Created) => void; notify: (s: string) => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(prev => ({ ...prev, [k]: v }));

  const changeRole = (role: StaffRole) => setD(prev => ({ ...prev, role, permissions: catalog.defaults[role] }));
  const toggle = (p: string) => set('permissions', d.permissions.includes(p) ? d.permissions.filter(x => x !== p) : [...d.permissions, p]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (existing) {
        // A person cannot change their own role or permissions; the server refuses it, so do not send them.
        await adminApi.updateStaff(existing.id, {
          name: d.name, facility: d.facility, version: existing.version,
          ...(d.role === 'doctor' ? { room: d.room, shiftStart: d.shiftStart, shiftEnd: d.shiftEnd } : {}),
          ...(self ? {} : { role: d.role, permissions: d.permissions }),
          ...(d.password ? { password: d.password } : {}),
        });
        notify('Staff account updated');
      } else {
        const { room, shiftStart, shiftEnd, ...rest } = d;
        const made = await adminApi.createStaff({ ...rest, ...(d.role === 'doctor' ? { room, shiftStart, shiftEnd } : {}), ...(d.password ? {} : { password: undefined }) });
        notify(made.firebase === 'not-configured' ? 'Saved. No Firebase account was created (server has no Firebase service account).' : 'Staff account created');
        onSaved(made);
        return;
      }
      onSaved();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={existing ? `Edit ${existing.name}` : 'Add staff member'} sub="Changes are recorded in the audit log." onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label>Full name<input required value={d.name} onChange={e => set('name', e.target.value)} /></label>
        <label>Email<input required type="email" value={d.email} disabled={!!existing} onChange={e => set('email', e.target.value)} /></label>
        <label>Role
          <select value={d.role} disabled={self} onChange={e => changeRole(e.target.value as StaffRole)}>
            {catalog.roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label>Facility / department<input value={d.facility} onChange={e => set('facility', e.target.value)} /></label>
        {d.role === 'doctor' && (
          <>
            <label>Consultation room<input value={d.room} placeholder="e.g. Room 4" maxLength={30} onChange={e => set('room', e.target.value)} /></label>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ flex: 1 }}>Hours from<input type="time" required value={d.shiftStart} onChange={e => set('shiftStart', e.target.value)} /></label>
              <label style={{ flex: 1 }}>to<input type="time" required value={d.shiftEnd} onChange={e => set('shiftEnd', e.target.value)} /></label>
            </div>
            <p className="muted span-2" style={{ margin: 0 }}>Appointments can only be booked inside these hours, and the room is shown on tokens, the queue and WhatsApp messages.</p>
          </>
        )}
        <div className="span-2">
          <b style={{ fontSize: 12 }}>Permissions</b>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
            {catalog.permissions[d.role].map(p => (
              <label key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                <input type="checkbox" checked={d.permissions.includes(p)} disabled={self} onChange={() => toggle(p)} /> {p}
              </label>
            ))}
          </div>
          {d.role === 'lab' && <p className="muted">"verify" lets this person sign off results. Keep it away from whoever enters results.</p>}
        </div>
        <label className="span-2">
          {existing ? 'Reset password (leave blank to keep)' : 'Temporary password (optional)'}
          <input type="password" minLength={8} autoComplete="new-password" value={d.password} onChange={e => set('password', e.target.value)} />
          <span className="muted">
            {existing ? 'Changes the sign-in password.' : catalog.firebase ? 'Leave blank: a one-time password is created in Firebase and shown to you once.' : 'Firebase is not set up on the server, so leave blank only if they will register themselves.'}
          </span>
        </label>
        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : existing ? 'Save changes' : 'Create account'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function StaffAccess({ selfId, notify }: { selfId: string; notify: (s: string) => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [editing, setEditing] = useState<Staff | 'new' | null>(null);
  const [showDisabled, setShowDisabled] = useState(false); // switched-off accounts are kept for the record but stay out of the way
  const [shown, setShown] = useState<{ title: string; lines: [string, string][]; note: string } | null>(null);

  const load = useCallback(() => {
    adminApi.staff().then(setStaff).catch(e => notify(e.message));
  }, [notify]);

  useEffect(() => {
    adminApi.catalog().then(setCatalog).catch(e => notify(e.message));
    load();
  }, [load, notify]);

  const setActive = async (u: Staff, active: boolean) => {
    if (!active && !window.confirm(`Disable ${u.name}? They are signed out immediately and cannot sign in until re-enabled.`)) return;
    try {
      await adminApi.updateStaff(u.id, { active, version: u.version });
      notify(active ? `${u.name} enabled` : `${u.name} disabled`);
      load();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const resetLink = async (u: Staff) => {
    try {
      const { link } = await adminApi.resetLink(u.id);
      setShown({ title: `Password reset link for ${u.name}`, lines: [['Link', link]], note: 'Send this to them yourself. They open it to choose a new password.' });
    } catch (e) {
      notify((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Staff & Access"
        sub="Create accounts, set roles and permissions, and switch access off. Administrators never see patient records."
        action={<button className="primary" onClick={() => setEditing('new')}>+ Add staff member</button>}
      />
      {staff.some(u => !u.active) && (
        <p style={{ margin: '0 0 8px' }}>
          <button type="button" className="secondary small-btn" onClick={() => setShowDisabled(v => !v)}>
            {showDisabled ? 'Hide' : 'Show'} disabled accounts ({staff.filter(u => !u.active).length})
          </button>
        </p>
      )}
      <div className="table-card card">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Permissions</th><th>Sign-in</th><th>Status</th><th /></tr></thead>
          <tbody>
            {staff.filter(u => u.active || showDisabled).map(u => (
              <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                <td><b>{u.name}</b><small>{u.email}</small></td>
                <td>{u.role}</td>
                <td>{u.permissions.join(', ') || '—'}</td>
                <td>{[u.localLogin && 'password', u.firebaseLinked && 'Firebase'].filter(Boolean).join(' + ') || 'not signed in yet'}</td>
                <td>{u.active ? 'Active' : 'Disabled'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="secondary small-btn" onClick={() => setEditing(u)}>Edit</button>{' '}
                  {u.id !== selfId && (
                    <button className="secondary small-btn" onClick={() => setActive(u, !u.active)}>{u.active ? 'Disable' : 'Enable'}</button>
                  )}{' '}
                  {catalog?.firebase && <button className="secondary small-btn" onClick={() => resetLink(u)}>Reset link</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown && (
        <Modal title={shown.title} sub={shown.note} onClose={() => setShown(null)}>
          {shown.lines.map(([k, v]) => (
            <label key={k} style={{ marginBottom: 12 }}>{k}<input readOnly value={v} onFocus={e => e.currentTarget.select()} /></label>
          ))}
          <div className="modal-actions">
            <button className="secondary" onClick={() => navigator.clipboard?.writeText(shown.lines.map(([k, v]) => `${k}: ${v}`).join('\n')).catch(() => {})}>Copy</button>
            <button className="primary" onClick={() => setShown(null)}>Done</button>
          </div>
        </Modal>
      )}
      {editing && catalog && (
        <StaffForm
          catalog={catalog}
          initial={editing === 'new' ? blank(catalog) : { name: editing.name, email: editing.email, role: editing.role, facility: editing.facility, permissions: editing.permissions, password: '', room: editing.room, shiftStart: editing.shiftStart, shiftEnd: editing.shiftEnd }}
          self={editing !== 'new' && editing.id === selfId}
          existing={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(made) => {
            setEditing(null);
            load();
            if (made?.temporaryPassword) {
              setShown({
                title: `Sign-in created for ${made.name}`,
                lines: [['Email', made.email], ['One-time password', made.temporaryPassword]],
                note: 'This password is shown only now and is not stored. Give it to them and ask them to change it after signing in.',
              });
            }
          }}
          notify={notify}
        />
      )}
    </>
  );
}
