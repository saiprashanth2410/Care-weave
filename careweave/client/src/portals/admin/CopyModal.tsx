import { useEffect, useState } from 'react';
import { Modal } from '../doctor/components';

export type CopyContent = { title: string; lines: [string, string][]; note: string };

/** Shows values the administrator has to pass on (a reset link, a one-time password) with a Copy button that says it worked. */
export function CopyModal({ content, onClose, notify }: { content: CopyContent; onClose: () => void; notify: (s: string) => void }) {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  useEffect(() => {
    if (copied === 'idle') return;
    const t = setTimeout(() => setCopied('idle'), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  /** A single value (a reset link) is copied as it is, so it can be pasted straight into a message. */
  const copy = async () => {
    const text = content.lines.length === 1 ? content.lines[0][1] : content.lines.map(([k, v]) => `${k}: ${v}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
      notify('Copied to clipboard');
    } catch {
      // The clipboard is blocked or unavailable: select the text so the person can press Cmd/Ctrl+C themselves.
      document.querySelector<HTMLInputElement>('.modal input[readonly]')?.select();
      setCopied('fail');
    }
  };

  return (
    <Modal title={content.title} sub={content.note} onClose={onClose}>
      {content.lines.map(([k, v]) => (
        <label key={k} style={{ marginBottom: 12 }}>{k}<input readOnly value={v} onFocus={e => e.currentTarget.select()} /></label>
      ))}
      <div className="modal-actions">
        <button className="secondary" onClick={copy} aria-live="polite">
          {copied === 'ok' ? 'Copied ✓' : copied === 'fail' ? 'Press Cmd/Ctrl + C' : 'Copy'}
        </button>
        <button className="primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
