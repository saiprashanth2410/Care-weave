import { AlertTriangle } from './icons';

export type CriticalAlert = {
  orderId: string;
  patientName: string;
  testName: string;
  values: { parameter: string; value: string; unit?: string }[];
};

/** A critical lab value stays on screen until it is dismissed (live alerts) or ages out (the dashboard list). */
export function CriticalBanner({ items, onDismiss }: { items: CriticalAlert[]; onDismiss?: (orderId: string) => void }) {
  if (!items.length) return null;
  return (
    <div role="alert" style={{ background: '#fdecec', border: '1px solid #c0392b', borderRadius: 10, padding: '12px 14px', margin: '0 0 16px', color: '#7a1c12' }}>
      <b style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={16} /> Critical lab result{items.length > 1 ? 's' : ''}: act now</b>
      {items.map((a) => (
        <div key={a.orderId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 6, fontSize: 14 }}>
          <span>
            <b>{a.patientName}</b> · {a.testName}: {a.values.map((v) => `${v.parameter} ${v.value} ${v.unit || ''}`.trim()).join('; ')}
          </span>
          {onDismiss && <button className="secondary" style={{ padding: '2px 10px' }} onClick={() => onDismiss(a.orderId)}>Seen</button>}
        </div>
      ))}
    </div>
  );
}
