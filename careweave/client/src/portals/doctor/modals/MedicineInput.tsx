import { useEffect, useState } from 'react';
import { api } from '../api';

export type MedicineHit = Awaited<ReturnType<typeof api.searchMedicines>>[number];

// Text box that suggests medicines from the catalogue as the doctor types.
export function MedicineInput({ value, onChange, onPick, compact = false }: {
  value: string;
  onChange: (text: string) => void;
  onPick: (medicine: MedicineHit) => void;
  /** One row of a table: no label above the box (the column heading names it). */
  compact?: boolean;
}) {
  const [hits, setHits] = useState<MedicineHit[]>([]);
  const [open, setOpen] = useState(false);

  const active = open && value.trim().length >= 2;
  const shownHits = active ? hits : [];

  useEffect(() => {
    const q = value.trim();
    if (!open || q.length < 2) return;
    const timer = setTimeout(() => api.searchMedicines(q).then(setHits).catch(() => setHits([])), 250);
    return () => clearTimeout(timer);
  }, [value, open]);

  const Wrap = compact ? 'div' : 'label';
  return (
    <Wrap className="med-field">
      {!compact && 'Drug Name & Formulation'}
      <input
        aria-label="Medicine name"
        autoComplete="off"
        placeholder="Type a brand or generic name…"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && shownHits.length > 0 && (
        <div className="med-menu">
          {shownHits.map(m => (
            <div
              key={m.id}
              className="med-option"
              onMouseDown={e => { e.preventDefault(); onPick(m); setOpen(false); }}
            >
              <b>{m.brand}</b> <span className="muted">{m.generic}</span>
              <small>{[m.strength, m.form].filter(Boolean).join(' · ')}</small>
            </div>
          ))}
        </div>
      )}
    </Wrap>
  );
}
