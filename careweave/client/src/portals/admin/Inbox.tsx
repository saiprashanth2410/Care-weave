import { useCallback, useEffect, useState } from 'react';
import { adminApi, type InboxItem } from './api';
import { PageHeader } from '../doctor/components';
import { CopyModal, type CopyContent } from './CopyModal';

type Tab = 'open' | 'resolved' | 'all';

const ago = (iso?: string) => {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const KIND: Record<InboxItem['kind'], string> = { help: 'Sign-in help', issue: 'Problem report' };

/**
 * Messages from staff, laid out like a mail client: the list on the left, the open message on the right. A request from the
 * sign-in page carries a "Send reset link" button for that person's account, so the whole job can be done from here.
 */
export function Inbox({ notify, refresh, canSendLinks, onChanged }: { notify: (s: string) => void; refresh: number; canSendLinks: boolean; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('open');
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [counts, setCounts] = useState({ new: 0, read: 0, resolved: 0 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [shown, setShown] = useState<CopyContent | null>(null);

  const load = useCallback(() => {
    adminApi.inbox(tab).then(r => { setItems(r.items); setCounts(r.counts); }).catch(e => notify(e.message));
  }, [tab, notify]);
  useEffect(() => { load(); }, [load, refresh]);

  const current = items?.find(m => m.id === openId) ?? null;

  const update = async (m: InboxItem, body: { status?: InboxItem['status']; note?: string }) => {
    try {
      const saved = await adminApi.updateInbox(m.id, body);
      setItems(list => (list ?? []).map(x => (x.id === saved.id ? saved : x)));
      onChanged();
      load();
    } catch (e) { notify((e as Error).message); }
  };

  const open = (m: InboxItem) => {
    setOpenId(m.id);
    setNote(m.note || '');
    if (m.status === 'new') void update(m, { status: 'read' });
  };

  const remove = async (m: InboxItem) => {
    if (!window.confirm(`Delete this message from ${m.fromName || m.fromEmail}? This cannot be undone.`)) return;
    try {
      await adminApi.deleteInbox(m.id);
      setOpenId(null);
      notify('Message deleted');
      onChanged();
      load();
    } catch (e) { notify((e as Error).message); }
  };

  const sendLink = async (m: InboxItem) => {
    try {
      const { link } = await adminApi.resetLink(m.staffId);
      setShown({ title: `Reset link for ${m.fromName || m.fromEmail}`, lines: [['Link', link]], note: 'Send this to them. They open it to choose a new password. It can be used once.' });
    } catch (e) { notify((e as Error).message); }
  };

  const tabBtn = (id: Tab, label: string, n?: number) => (
    <button type="button" className={tab === id ? 'primary small-btn' : 'secondary small-btn'} onClick={() => { setTab(id); setOpenId(null); }}>
      {label}{n ? ` (${n})` : ''}
    </button>
  );

  return (
    <>
      <PageHeader eyebrow="Administration" title="Inbox" sub="Messages from staff: people who cannot sign in, and problems reported from inside the portals." />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {tabBtn('open', 'Open', counts.new + counts.read)}
        {tabBtn('resolved', 'Resolved', counts.resolved)}
        {tabBtn('all', 'All')}
      </div>

      <div className="inbox-grid">
        <div className="table-card card" style={{ padding: 0, maxHeight: '70vh', overflowY: 'auto' }} role="list" aria-label="Messages">
          {items === null && <p className="muted" style={{ padding: 16 }} role="status">Loading…</p>}
          {items?.length === 0 && <p className="muted" style={{ padding: 16 }}>{tab === 'resolved' ? 'Nothing resolved yet.' : 'No messages. When staff ask for help, it appears here.'}</p>}
          {items?.map(m => (
            <button
              key={m.id}
              type="button"
              role="listitem"
              onClick={() => open(m)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', border: 0, borderBottom: '1px solid #c3cac2',
                background: m.id === openId ? '#e9ece7' : 'transparent', cursor: 'pointer',
              }}
            >
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b style={{ fontWeight: m.status === 'new' ? 800 : 600 }}>
                  {m.status === 'new' && <span aria-label="Unread" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: '#0c6b6d', marginRight: 6 }} />}
                  {m.fromName || m.fromEmail}
                </b>
                <small className="muted">{ago(m.lastAt || m.createdAt)}</small>
              </span>
              <span style={{ display: 'block', fontSize: 12, fontWeight: m.status === 'new' ? 700 : 500 }}>{m.subject}</span>
              <span className="muted" style={{ display: 'block', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.message || KIND[m.kind]}
              </span>
            </button>
          ))}
        </div>

        <div className="card" style={{ padding: 20, minHeight: 240 }}>
          {!current && <p className="muted">Choose a message on the left to read it.</p>}
          {current && (
            <article aria-label="Message">
              <p className="eyebrow" style={{ margin: 0 }}>{KIND[current.kind]} · {current.status}</p>
              <h2 style={{ margin: '4px 0 8px', fontSize: 20 }}>{current.subject}</h2>
              <p className="muted" style={{ margin: '0 0 12px' }}>
                From <b>{current.fromName || 'Unknown'}</b> &lt;{current.fromEmail}&gt;
                {current.fromRole ? ` · ${current.fromRole}` : ''} · {new Date(current.createdAt).toLocaleString()}
                {current.count > 1 ? ` · asked ${current.count} times` : ''}
              </p>
              <p style={{ margin: '0 0 12px', fontSize: 12 }}>
                {current.kind === 'help' && (current.knownStaff ? 'This address belongs to a staff account.' : 'This address is not a staff account (or the account is disabled). Check the spelling before sending anything.')}
                {current.page ? `Reported from ${current.page}` : ''}
              </p>
              <div style={{ whiteSpace: 'pre-wrap', border: '1px solid #c3cac2', padding: 12, background: '#f6f7f3', minHeight: 60 }}>
                {current.message || <span className="muted">{current.kind === 'help' ? 'They asked for help signing in (usually a forgotten password) and wrote nothing more.' : 'No message was written.'}</span>}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
                {current.kind === 'help' && current.staffId && current.staffActive && canSendLinks && (
                  <button type="button" className="primary" onClick={() => sendLink(current)}>Send reset link</button>
                )}
                {current.status !== 'resolved'
                  ? <button type="button" className="secondary" onClick={() => update(current, { status: 'resolved', note })}>Mark resolved</button>
                  : <button type="button" className="secondary" onClick={() => update(current, { status: 'new' })}>Reopen</button>}
              </div>

              <label>
                Note for the record (optional)
                <textarea value={note} maxLength={500} onChange={e => setNote(e.target.value)} style={{ minHeight: 70, width: '100%' }} />
              </label>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <button type="button" className="secondary small-btn" onClick={() => update(current, { note })} disabled={note === (current.note || '')}>Save note</button>
                <button
                  type="button"
                  className="small-btn"
                  style={{ background: '#a3341f', color: '#fff', border: 0, borderRadius: 3, padding: '7px 12px', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => remove(current)}
                >
                  Delete
                </button>
              </div>
              {current.status === 'resolved' && current.resolvedBy && (
                <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>Resolved by {current.resolvedBy} {ago(current.resolvedAt)}</p>
              )}
            </article>
          )}
        </div>
      </div>
      {shown && <CopyModal content={shown} onClose={() => setShown(null)} notify={notify} />}
    </>
  );
}
