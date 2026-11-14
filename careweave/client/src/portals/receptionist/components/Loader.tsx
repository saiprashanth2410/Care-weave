/** Shown while a list is being fetched, so an empty screen is never mistaken for "nothing here". */
export default function Loader({ label = 'Loading…', compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={compact ? 'cw-loader compact' : 'cw-loader'} role="status" aria-live="polite">
      <span className="cw-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
