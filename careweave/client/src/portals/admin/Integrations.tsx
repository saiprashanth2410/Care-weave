import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { adminApi, type GeminiStatus, type GeminiTest } from './api';
import { Modal, PageHeader } from '../doctor/components';
import './integrations.css';

type Dialog = null | 'first' | 'unlock' | 'change' | 'remove';
const MASK = '••••••••••••••••••••••••••••••••';

/**
 * The Gemini key for the whole system. It sits in the box locked (dots only); the lock opens with the passcode the administrator chose
 * the first time. The server checks the passcode and only then returns the key, so a copy of this page never holds it.
 */
export function Integrations({ notify }: { notify: (s: string) => void }) {
  const [st, setSt] = useState<GeminiStatus | null>(null);
  const [draft, setDraft] = useState('');
  const [locked, setLocked] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<GeminiTest | 'running' | null>(null);
  const passcode = useRef(''); // held in memory only while the key is unlocked, so Save does not ask again

  const apply = useCallback((s: GeminiStatus) => {
    setSt(s);
    if (!s.configured || !s.hasPasscode) setLocked(false);
  }, []);
  useEffect(() => {
    adminApi.gemini().then(s => { setSt(s); setLocked(s.source === 'admin' && s.hasPasscode); }).catch(e => notify(e.message));
  }, [notify]);

  const lock = () => { passcode.current = ''; setDraft(''); setReveal(false); setLocked(true); };
  const savedHere = !!st && st.source === 'admin';

  if (!st) return <PageHeader eyebrow="Administration" title="Integrations & API keys" sub="Loading…" />;

  const onLockClick = () => {
    if (locked) setDialog('unlock');
    else if (st.hasPasscode) { lock(); notify('The key is locked again'); }
    else setDialog('first');
  };

  const save = async () => {
    const key = draft.trim();
    if (key.length < 20) return notify('Paste the Gemini API key first');
    if (!st.hasPasscode) return setDialog('first');
    setBusy(true);
    try {
      apply(await adminApi.saveGemini(key, passcode.current));
      notify('Gemini key saved. The portals use it now.');
      lock();
    } catch (e: any) { notify(e.message); } finally { setBusy(false); }
  };

  const runTest = async () => {
    setTest('running');
    try { setTest(await adminApi.testGemini(draft.trim() || undefined)); } catch (e: any) { setTest({ ok: false, error: e.message }); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(draft); notify('Copied to clipboard'); } catch { notify('Could not copy. Select the key and press Cmd/Ctrl + C.'); }
  };

  const option = async (body: { scan?: boolean; brief?: boolean; model?: string }) => {
    try { apply(await adminApi.geminiOptions(body)); } catch (e: any) { notify(e.message); }
  };

  return (
    <>
      <PageHeader eyebrow="Administration" title="Integrations & API keys"
        sub="Set the key once here and the portals that need it start using it. The key is kept encrypted on the server and opens only with your passcode." />

      <div className="card ig-card">
        <div className="ig-head">
          <span className="ig-logo" aria-hidden>G</span>
          <div>
            <h3>Google Gemini AI</h3>
            <p className="muted">Reads scanned lab reports and writes the doctor's chart brief.</p>
          </div>
          <span className={`ig-status ${st.configured ? 'on' : 'off'}`} role="status">
            <span className="ig-dot" />{st.configured ? (savedHere ? `Active · ends …${st.last4}` : 'Active · set on the server') : 'Not configured'}
          </span>
        </div>

        <div className="ig-label">
          <label htmlFor="gemini-key">Google Gemini API key <span style={{ color: '#a3341f' }}>*</span></label>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Get a key from Google AI Studio</a>
        </div>
        <div className="ig-box">
          <input id="gemini-key" autoComplete="off" spellCheck={false} placeholder="AIzaSy…" readOnly={locked}
            type={locked || reveal ? 'text' : 'password'}
            value={locked ? (st.configured ? MASK : '') : draft}
            onChange={e => { setDraft(e.target.value); setTest(null); }} />
          <div className="ig-icons">
            {!locked && draft && <button type="button" className="icon-button" aria-label="Copy the key" title="Copy the key" onClick={copy}><Copy size={15} /></button>}
            {!locked && <button type="button" className="icon-button" aria-label={reveal ? 'Hide the key' : 'Show the key'} title={reveal ? 'Hide' : 'Show'} onClick={() => setReveal(v => !v)}>{reveal ? <EyeOff size={15} /> : <Eye size={15} />}</button>}
            <button type="button" className={`ig-lock ${locked ? 'locked' : ''}`} aria-label={locked ? 'Locked. Unlock with the passcode' : st.hasPasscode ? 'Unlocked. Lock again' : 'Set a passcode and lock'}
              title={locked ? 'Locked with your passcode. Click to unlock.' : st.hasPasscode ? 'Unlocked. Click to lock again.' : 'Click to set a passcode and lock.'} onClick={onLockClick}>
              {locked ? <Lock size={15} /> : <Unlock size={15} />}
            </button>
          </div>
        </div>
        <p className="muted ig-hint">
          {locked ? 'The key is locked with your passcode. Click the lock to view or replace it.'
            : st.hasPasscode ? 'Unlocked for editing. Click the lock when you are done.'
              : 'Paste the key, then Save. You will be asked to choose a passcode once.'}
          {st.updatedAt && <span className="ig-when"> Updated {new Date(st.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{st.updatedBy ? ` by ${st.updatedBy.replace(/\s*\(.*\)$/, '')}` : ''}</span>}
        </p>
        {st.source === 'env' && <p className="notice warning">A key is already set on the server (GEMINI_API_KEY) and is in use. A key saved here replaces it.</p>}
        {st.lockedUntil && <p className="notice warning">Too many wrong passcodes. Unlocking is paused for a few minutes.</p>}

        <div className="ig-actions">
          <button type="button" className="secondary" disabled={test === 'running' || (locked && !st.configured)} onClick={runTest}>{test === 'running' ? 'Testing…' : 'Test connection'}</button>
          {test && test !== 'running' && (
            <span className={`ig-result ${test.ok ? 'ok' : 'bad'}`} role="status">
              {test.ok ? `✓ Connected · ${test.model} · ${(test.ms / 1000).toFixed(1)} s` : test.error}
            </span>
          )}
          {!locked && <button type="button" className="primary ig-save" disabled={busy} onClick={save}><Lock size={13} />{busy ? 'Saving…' : 'Save & lock key'}</button>}
        </div>

        <div className="ig-foot">
          <span className="ig-shield">Passcode controls</span>
          <button type="button" className="text-button" disabled={!st.hasPasscode} onClick={() => setDialog('change')}>Change passcode</button>
          <span aria-hidden>|</span>
          <button type="button" className="text-button ig-danger" disabled={!savedHere} onClick={() => setDialog('remove')}>Remove key</button>
        </div>
      </div>

      <div className="card table-card ig-used">
        <div style={{ padding: '18px 22px 6px' }}>
          <h3>Where Gemini is used</h3>
          <p className="muted" style={{ margin: 0 }}>Only the portals that need it are listed. Switch a feature off and that portal stops using the key.</p>
        </div>
        <table>
          <thead><tr><th>Portal</th><th>Feature</th><th>Needs the key?</th><th>Enabled</th></tr></thead>
          <tbody>
            <tr>
              <td><span className="ig-portal">Laboratory</span></td>
              <td><b>Scan a laboratory report</b><small>"Scan" in result entry reads a photo or PDF into a draft a person must check.</small></td>
              <td><b style={{ color: '#a3341f' }}>Required</b><small>{st.configured && st.features.scan ? 'Working' : !st.configured ? 'Scanning is off until a key is set' : 'Switched off'}</small></td>
              <td><Switch label="Laboratory report scanner" on={st.features.scan} disabled={!st.configured} onChange={v => option({ scan: v })} /></td>
            </tr>
            <tr>
              <td><span className="ig-portal doc">Doctor</span></td>
              <td><b>Pre-consult chart brief</b><small>A short reading aid made from the chart before the visit.</small></td>
              <td><b style={{ color: '#7d5200' }}>Optional</b><small>{st.configured && st.features.brief ? 'Brief is written by AI' : 'Brief is made from the chart by rules, without AI'}</small></td>
              <td><Switch label="Doctor pre-consult brief" on={st.features.brief} disabled={!st.configured} onChange={v => option({ brief: v })} /></td>
            </tr>
            <tr className="ig-none">
              <td><span className="ig-portal rec">Receptionist</span></td>
              <td><b>Nothing here uses Gemini</b></td>
              <td><b>Not needed</b></td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
        <div className="ig-model">
          <label>Model <span className="muted">(optional, leave empty for automatic)</span>
            <input aria-label="Gemini model" defaultValue={st.model} placeholder="Automatic" disabled={!savedHere} key={st.model}
              onBlur={e => { if (e.target.value.trim() !== st.model) option({ model: e.target.value.trim() }); }} />
          </label>
        </div>
      </div>

      {dialog === 'first' && <FirstPasscode draft={draft} onClose={() => setDialog(null)} onDone={(s, pass) => { passcode.current = pass; apply(s); notify('Passcode set and key saved. The portals use it now.'); setDialog(null); lock(); }} />}
      {dialog === 'unlock' && <UnlockDialog onClose={() => setDialog(null)} onDone={(key, pass) => { passcode.current = pass; setDraft(key); setLocked(false); setDialog(null); notify('Passcode accepted. The key is open for editing.'); }} />}
      {dialog === 'change' && <ChangePasscode onClose={() => setDialog(null)} onDone={s => { apply(s); setDialog(null); notify('Passcode changed'); lock(); }} />}
      {dialog === 'remove' && <RemoveKey onClose={() => setDialog(null)} onDone={s => { apply(s); setDialog(null); passcode.current = ''; setDraft(''); notify('Gemini key removed'); }} />}
    </>
  );
}

function Switch({ label, on, disabled, onChange }: { label: string; on: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on && !disabled} aria-label={label} disabled={disabled} className={`ig-switch ${on && !disabled ? 'on' : ''}`} onClick={() => onChange(!on)}><span /></button>;
}

/** A small form inside a modal that shows one error line and a busy state. */
function useForm<T>(run: () => Promise<T>, done: (r: T) => void) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return {
    error, busy,
    submit: async (e: React.FormEvent) => {
      e.preventDefault(); setError(''); setBusy(true);
      try { done(await run()); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
    },
    fail: setError,
  };
}

function FirstPasscode({ draft, onClose, onDone }: { draft: string; onClose: () => void; onDone: (s: GeminiStatus, passcode: string) => void }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const f = useForm(async () => {
    if (a.trim().length < 4) throw new Error('The passcode must be at least 4 characters.');
    if (a.trim() !== b.trim()) throw new Error('The two passcodes do not match. Enter them again.');
    if (draft.trim().length < 20) throw new Error('Paste the Gemini API key in the box first.');
    return adminApi.saveGemini(draft.trim(), a.trim());
  }, s => onDone(s, a.trim()));
  return (
    <Modal title="Set a passcode" sub="You choose it once. It locks the key, and you enter it to view, replace or remove the key." onClose={onClose}>
      <form className="ig-form" onSubmit={f.submit}>
        <label>Passcode (4 or more characters)<input type="password" autoFocus autoComplete="new-password" value={a} onChange={e => setA(e.target.value)} /></label>
        <label>Enter it again to confirm<input type="password" autoComplete="new-password" value={b} onChange={e => setB(e.target.value)} /></label>
        {f.error && <p className="alert danger" role="alert">{f.error}</p>}
        <p className="muted">There is no way to recover a forgotten passcode here. Keep it somewhere safe.</p>
        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={f.busy}>{f.busy ? 'Saving…' : 'Set passcode & lock key'}</button></div>
      </form>
    </Modal>
  );
}

function UnlockDialog({ onClose, onDone }: { onClose: () => void; onDone: (key: string, passcode: string) => void }) {
  const [p, setP] = useState('');
  const f = useForm(async () => (await adminApi.unlockGemini(p.trim())).apiKey, key => onDone(key, p.trim()));
  return (
    <Modal title="Enter the passcode" sub="This opens the Gemini key so you can view, copy or replace it." onClose={onClose}>
      <form className="ig-form" onSubmit={f.submit}>
        <label>Passcode<input type="password" autoFocus autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} /></label>
        {f.error && <p className="alert danger" role="alert">{f.error}</p>}
        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={f.busy || !p.trim()}>{f.busy ? 'Checking…' : 'Unlock key'}</button></div>
      </form>
    </Modal>
  );
}

function ChangePasscode({ onClose, onDone }: { onClose: () => void; onDone: (s: GeminiStatus) => void }) {
  const [cur, setCur] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const f = useForm(async () => {
    if (a.trim().length < 4) throw new Error('The new passcode must be at least 4 characters.');
    if (a.trim() !== b.trim()) throw new Error('The new passcodes do not match.');
    return adminApi.changeGeminiPasscode(cur.trim(), a.trim());
  }, onDone);
  return (
    <Modal title="Change the passcode" sub="The key stays as it is. Only the passcode that opens it changes." onClose={onClose}>
      <form className="ig-form" onSubmit={f.submit}>
        <label>Current passcode<input type="password" autoFocus autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} /></label>
        <label>New passcode (4 or more characters)<input type="password" autoComplete="new-password" value={a} onChange={e => setA(e.target.value)} /></label>
        <label>Enter the new passcode again<input type="password" autoComplete="new-password" value={b} onChange={e => setB(e.target.value)} /></label>
        {f.error && <p className="alert danger" role="alert">{f.error}</p>}
        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={f.busy || !cur.trim()}>{f.busy ? 'Saving…' : 'Change passcode'}</button></div>
      </form>
    </Modal>
  );
}

function RemoveKey({ onClose, onDone }: { onClose: () => void; onDone: (s: GeminiStatus) => void }) {
  const [p, setP] = useState('');
  const f = useForm(() => adminApi.removeGemini(p.trim()), onDone);
  return (
    <Modal title="Remove the Gemini key" sub="Report scanning stops until a new key is added. The doctor's brief keeps working from the chart without AI." onClose={onClose}>
      <form className="ig-form" onSubmit={f.submit}>
        <label>Passcode to confirm<input type="password" autoFocus autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} /></label>
        {f.error && <p className="alert danger" role="alert">{f.error}</p>}
        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary ig-del" disabled={f.busy || !p.trim()}>{f.busy ? 'Removing…' : 'Remove key'}</button></div>
      </form>
    </Modal>
  );
}
