import { AlertTriangle, BellRing } from './icons';

export type CriticalAlert = {
  orderId: string;
  patientName: string;
  testName: string;
  values: { parameter: string; value: string; unit?: string }[];
};

/** Plays an urgent medical alert tone through Web Audio API to alert the doctor immediately */
function playEmergencyChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Ignore audio autoplay restrictions
  }
}

/** A critical lab value stays on screen until it is dismissed (live alerts) or ages out (the dashboard list). */
export function CriticalBanner({ items, onDismiss }: { items: CriticalAlert[]; onDismiss?: (orderId: string) => void }) {
  if (!items.length) return null;
  return (
    <div role="alert" style={{ background: '#fdecec', border: '2px solid #e53e3e', borderRadius: 8, padding: '14px 18px', margin: '0 0 16px', color: '#7a1c12', boxShadow: '0 4px 12px rgba(229, 62, 62, 0.15)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <b style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <AlertTriangle size={18} style={{ color: '#e53e3e', animation: 'bounce 1s infinite' }} /> 
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚠️ CRITICAL LAB ALERT — IMMEDIATE PHYSICIAN ACTION REQUIRED</span>
        </b>
        <button 
          type="button"
          onClick={playEmergencyChime}
          style={{ background: '#fff', border: '1px solid #feb2b2', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#c53030' }}
          title="Play alarm audio tone"
        >
          <BellRing size={12} /> Test Chime
        </button>
      </div>
      {items.map((a) => (
        <div key={a.orderId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 10, fontSize: 13, background: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #fed7d7' }}>
          <span>
            <strong style={{ color: '#1a202c' }}>{a.patientName}</strong> · <span style={{ color: '#4a5568' }}>{a.testName}:</span>{' '}
            <span style={{ color: '#e53e3e', fontWeight: 'bold' }}>
              {a.values.map((v) => `${v.parameter} = ${v.value} ${v.unit || ''}`.trim()).join('; ')}
            </span>
          </span>
          {onDismiss && (
            <button 
              className="secondary" 
              style={{ padding: '3px 12px', fontSize: 11, fontWeight: 'bold', border: '1px solid #e2e8f0' }} 
              onClick={() => onDismiss(a.orderId)}
            >
              Acknowledge
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
