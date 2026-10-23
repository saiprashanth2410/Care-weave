import React from 'react';
import { RefreshCw, X } from './icons';

export function PageHeader({ eyebrow, title, sub, action }: { eyebrow?: string; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="muted">{sub}</p>
      </div>
      {action}
    </div>
  );
}


export function StatCard({ label, value, delta, icon, tone = 'teal' }: { label: string; value: string | number; delta?: string; icon: React.ReactNode; tone?: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {delta && <small className="positive">{delta}</small>}
      </div>
    </div>
  );
}


export function StatusBadge({ status }: { status: string }) {
  return <span className={`status ${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>;
}


export function Loading() {
  return (
    <div className="loading-card">
      <RefreshCw className="spin" size={20} />
      <span>Loading clinical records…</span>
    </div>
  );
}


export function Modal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p className="muted">{sub || 'Clinician authorized action with server-side audit logging.'}</p>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
