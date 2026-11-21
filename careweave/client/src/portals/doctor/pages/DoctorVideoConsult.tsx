import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Patient } from '../types';
import { PageHeader } from '../components';
import VideoCall from '@/video/VideoCall';
import ChatPanel from '@/video/ChatPanel';
import { useCall } from '@/video/useCall';
import { useCaptions } from '@/video/useCaptions';
import { CAPTION_LANGUAGES, LANGUAGE_NAME } from '@/video/useSpeech';

type Started = { id: string; doctorKey: string; expiresAt: string; patientName: string; hasPhone: boolean };
type Line = { from: 'doctor' | 'patient'; kind: 'chat' | 'caption'; text: string; at: number };
type Summary = { loading: boolean; text?: string; lines?: Line[]; note?: string; error?: string };
type Tab = 'details' | 'chat' | 'summary';

const NOTES: Record<string, string> = {
  'ai-off': 'The AI summary is switched off. An administrator can add the Gemini key and turn on the doctor brief under Integrations. Here is what was said:',
  'ai-failed': 'The AI could not write a summary right now. Here is what was said:'
};

/** Start a video consultation with a patient from the doctor portal; the patient joins from a link, no account needed. */
export function DoctorVideoConsult({ notify }: { notify: (s: string) => void }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [walkIn, setWalkIn] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [started, setStarted] = useState<Started | null>(null);
  const [ended, setEnded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendNote, setSendNote] = useState('');
  const [tab, setTab] = useState<Tab>('details');
  const [seen, setSeen] = useState(0);
  const [summary, setSummary] = useState<Summary>({ loading: false });

  const call = useCall({ token: started?.id ?? '', role: 'doctor', doctorKey: started?.doctorKey, enabled: Boolean(started) && !ended });
  const cc = useCaptions(call);
  const incoming = call.messages.filter((m) => m.from !== 'doctor').length;
  const unread = tab === 'chat' ? 0 : Math.max(0, incoming - seen);
  const open = (t: Tab) => { if (t === 'chat') setSeen(incoming); setTab(t); };

  useEffect(() => {
    api.patients().then((rows) => {
      setPatients(rows);
      if (rows.length) setPatientId(rows[0].id);
    }).catch(() => {});
  }, []);

  const link = started ? `${window.location.origin}/consult/${started.id}` : '';

  const start = async () => {
    setBusy(true);
    setSendNote('');
    try {
      const res = await fetch('/api/video/consults', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(walkIn ? { name: guestName, phone: guestPhone } : { patientId }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not start the consultation');
      setStarted(body);
      setEnded(false);
      setTab('details');
      setSeen(0);
      setSummary({ loading: false });
    } catch (e: any) {
      notify(e.message || 'Could not start the consultation');
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async () => {
    if (!started) return;
    setSendNote('Sending…');
    const res = await fetch(`/api/video/consults/${started.id}/send`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setSendNote(res.ok ? 'Link sent to the patient on WhatsApp.' : `Not sent: ${body.error || 'unknown error'}. Copy the link and share it yourself.`);
  };

  const copy = async (text: string, done = 'Copied') => {
    try { await navigator.clipboard.writeText(text); notify(done); } catch { notify('Select the text and copy it'); }
  };

  const end = async () => {
    if (started) {
      // The front desk shows this doctor as on a video call until the server hears the call has ended, so a failure must not be hidden.
      const res = await fetch(`/api/video/consults/${started.id}/end`, { method: 'POST' }).catch(() => null);
      if (!res || !res.ok) {
        notify('Could not end the consultation on the server. Check your connection and press End again.');
        return;
      }
    }
    setEnded(true);
    setTab('summary');
    notify('Consultation ended. You can still generate the summary.');
  };

  const reset = () => { setStarted(null); setEnded(false); setSendNote(''); setSummary({ loading: false }); };

  const summarise = async () => {
    if (!started) return;
    setSummary({ loading: true });
    try {
      const res = await fetch(`/api/video/consults/${started.id}/summary`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setSummary({ loading: false, error: body.error || 'Could not create the summary' });
      setSummary({ loading: false, text: body.summary || undefined, lines: body.lines, note: body.summary ? undefined : NOTES[body.reason] });
    } catch {
      setSummary({ loading: false, error: 'Could not reach the server' });
    }
  };

  const transcriptText = (lines: Line[]) => lines.map((l) => `${l.from === 'doctor' ? 'Doctor' : 'Patient'}: ${l.text}`).join('\n');

  return (
    <>
      <PageHeader
        eyebrow="Telemedicine"
        title="Video Consultation"
        sub="Start a secure video call. The patient opens a temporary link on their phone, with no account or app. The video goes browser to browser."
      />

      {!started ? (
        <div className="card">
          <div className="vc-mode" role="tablist" aria-label="Who is the call with">
            <button type="button" role="tab" aria-selected={!walkIn} className={!walkIn ? 'on' : ''} onClick={() => setWalkIn(false)}>Registered patient</button>
            <button type="button" role="tab" aria-selected={walkIn} className={walkIn ? 'on' : ''} onClick={() => setWalkIn(true)}>Walk-in / phone-in</button>
          </div>
          {!walkIn ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <b>Patient:</b>
                <select value={patientId} onChange={(e) => setPatientId(e.target.value)} style={{ minWidth: 'min(260px, 100%)', flex: '1 1 260px', maxWidth: 420 }} aria-label="Patient">
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.patientId})</option>)}
                </select>
                <button className="primary" onClick={start} disabled={busy || !patientId}>{busy ? 'Starting…' : 'Start video consult'}</button>
              </div>
              {patients.length === 0 && <p className="muted" style={{ marginTop: 12 }}>Only patients with an appointment or encounter assigned to you appear here. For anyone else use Walk-in / phone-in.</p>}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Name" aria-label="Walk-in name" style={{ flex: '1 1 200px', maxWidth: 300 }} maxLength={80} />
                <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="Phone (optional, for the WhatsApp link)" aria-label="Walk-in phone" style={{ flex: '1 1 240px', maxWidth: 340 }} inputMode="tel" maxLength={20} />
                <button className="primary" onClick={start} disabled={busy || guestName.trim().length < 2}>{busy ? 'Starting…' : 'Start video consult'}</button>
              </div>
              <p className="muted" style={{ marginTop: 12 }}>For someone with no record yet: only a name and phone are used, no chart is opened. Ask the front desk to register them afterwards.</p>
            </>
          )}
        </div>
      ) : (
        <div className="vc-layout">
          <div className="card">
            {!ended ? (
              <VideoCall call={call} role="doctor" cc={cc} onHangUp={end} />
            ) : (
              <div className="vc-ended">
                <b>Consultation ended</b>
                <p className="muted">The link no longer works. Use the Summary tab to write up what was discussed.</p>
                <button className="primary" onClick={reset}>Start another consultation</button>
              </div>
            )}
          </div>

          <div className="card vc-side">
            <div className="vc-tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'on' : ''} onClick={() => open('details')}>Details</button>
              <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'on' : ''} onClick={() => open('chat')} disabled={ended}>
                Chat{unread > 0 && <span className="vc-badge">{unread}</span>}
              </button>
              <button role="tab" aria-selected={tab === 'summary'} className={tab === 'summary' ? 'on' : ''} onClick={() => open('summary')}>Summary</button>
            </div>

            {tab === 'details' && (
              <div className="vc-pane">
                <h3>Consultation with {started.patientName}</h3>
                {!ended && (
                  <>
                    <p className="muted">Share this link with the patient. It works for about 2 hours and needs no account.</p>
                    <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Patient link" style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} />
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button className="secondary" onClick={() => copy(link, 'Link copied')}>Copy link</button>
                      <button className="secondary" onClick={sendLink} disabled={!started.hasPhone}>Send on WhatsApp</button>
                      {!started.hasPhone && <span className="muted">No phone number on file.</span>}
                    </div>
                    {sendNote && <p className="muted" role="status">{sendNote}</p>}
                    <label className="vc-lang">
                      <span>Language you speak (for captions)</span>
                      <select value={cc.lang} onChange={(e) => cc.setLang(e.target.value)} aria-label="Language you speak">
                        {CAPTION_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                      </select>
                    </label>
                    <label className="vc-check">
                      <input type="checkbox" checked={cc.translate} onChange={(e) => cc.setTranslate(e.target.checked)} />
                      <span>Translate what I say for the patient</span>
                    </label>
                    <p className="muted" role="status">
                      {cc.peerLang
                        ? cc.peerLang === cc.lang
                          ? `The patient speaks ${LANGUAGE_NAME[cc.peerLang] || cc.peerLang}, the same as you.`
                          : `The patient speaks ${LANGUAGE_NAME[cc.peerLang] || cc.peerLang}. ${cc.translate ? 'Captions are translated both ways by AI.' : 'Translation is off.'}`
                        : 'Once the patient joins, their language shows here and captions are translated both ways.'}
                    </p>
                    {!cc.supported && <p className="muted">Captions need Chrome or Edge. Chat and the call itself work in any browser.</p>}
                  </>
                )}
                <ul className="vc-tips">
                  <li>Captions turn each person's speech into text, shown on the video and kept for the summary.</li>
                  <li>The video goes directly between your browser and the patient's phone; only chat and captions pass through the server.</li>
                  <li>Press <b>End</b> when you are done; the link stops working.</li>
                </ul>
              </div>
            )}

            {tab === 'chat' && <div className="vc-pane vc-pane-chat"><ChatPanel messages={call.messages} role="doctor" onSend={(t, img) => void call.sendChat(t, img)} /></div>}

            {tab === 'summary' && (
              <div className="vc-pane">
                <h3>Summary</h3>
                <p className="muted">Written from the chat and the captions of this call. Check it before using it in the record.</p>
                <button className="primary" onClick={summarise} disabled={summary.loading}>{summary.loading ? 'Writing summary…' : summary.text || summary.lines ? 'Generate again' : 'Generate summary'}</button>
                {summary.error && <p className="vc-problem" role="alert">{summary.error}</p>}
                {summary.text && (
                  <>
                    <pre className="vc-summary">{summary.text}</pre>
                    <button className="secondary" onClick={() => copy(summary.text!, 'Summary copied')}>Copy summary</button>
                  </>
                )}
                {summary.note && <p className="muted">{summary.note}</p>}
                {summary.lines && !summary.text && (
                  <>
                    <pre className="vc-summary">{transcriptText(summary.lines)}</pre>
                    <button className="secondary" onClick={() => copy(transcriptText(summary.lines!), 'Transcript copied')}>Copy transcript</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
