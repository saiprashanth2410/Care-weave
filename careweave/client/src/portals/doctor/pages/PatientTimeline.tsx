import { useState } from 'react';
import { ClipboardList, FileText, FlaskConical, RefreshCw, Stethoscope } from '../icons';
import type { PatientRecord } from '../types';
import { fmtDate } from '../helpers';
import { StatusBadge } from '../components';

export function TimelineView({ record }: { record: PatientRecord }) {
  const [filterType, setFilterType] = useState('all');

  const shown = filterType === 'all'
    ? record.timeline
    : record.timeline.filter(e => e.type.toLowerCase().includes(filterType.toLowerCase()));

  return (
    <div className="timeline-view">
      <div className="timeline-summary">
        <div>
          <span>Total Connected Events</span>
          <b>{record.timeline.length}</b>
        </div>
        <div>
          <span>Verified lab reports</span>
          <b>{record.labOrders.filter(l => l.status === 'Verified' || l.status === 'Released to Doctor').length}</b>
        </div>
        <div>
          <span>External Source Records</span>
          <b>{record.timeline.filter(e => e.imported).length}</b>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button className={`action-pill ${filterType === 'all' ? 'amber' : ''}`} onClick={() => setFilterType('all')}>All Events</button>
        <button className={`action-pill ${filterType === 'consultation' ? 'amber' : ''}`} onClick={() => setFilterType('consultation')}>Consultations</button>
        <button className={`action-pill ${filterType === 'lab' ? 'amber' : ''}`} onClick={() => setFilterType('lab')}>Lab Results</button>
        <button className={`action-pill ${filterType === 'prescription' ? 'amber' : ''}`} onClick={() => setFilterType('prescription')}>Prescriptions</button>
      </div>

      <div className="timeline">
        {shown.map(e => <TimelineItem event={e} key={e.id} />)}
      </div>
    </div>
  );
}


export function TimelineItem({ event }: { event: any }) {
  return (
    <div className="timeline-item">
      <div className={`timeline-icon ${event.type.toLowerCase().replace(' ', '-')}`}>
        {event.type === 'Lab result' ? (
          <FlaskConical size={16} />
        ) : event.type === 'Prescription' ? (
          <FileText size={16} />
        ) : event.type === 'Consultation' ? (
          <Stethoscope size={16} />
        ) : event.type === 'Referral' ? (
          <ClipboardList size={16} />
        ) : (
          <RefreshCw size={16} />
        )}
      </div>
      <div className="timeline-content">
        <div className="timeline-meta">
          <span>{fmtDate(event.date)}</span>
          <span>·</span>
          <span>{event.source}</span>
          {event.imported && <span className="imported-label">Imported Source</span>}
        </div>
        <h4>{event.title}</h4>
        <p>{event.detail}</p>
        <div className="timeline-foot">
          <span className="mono">{event.reference || 'CareWeave record'}</span>
          {event.status && <StatusBadge status={event.status} />}
        </div>
      </div>
    </div>
  );
}


export function LabReview({ record }: { record: PatientRecord }) {
  return (
    <div className="lab-review">
      {record.chart.length > 0 && (
        <div className="chart-card">
          <div className="card-head">
            <div>
              <h3>Comparable Laboratory Trend</h3>
              <p className="muted">Longitudinal comparison of verified & released diagnostic values.</p>
            </div>
            <span className="pill">{record.chart[0].test}</span>
          </div>
          <div className="bars">
            {record.chart.map((c, i) => (
              <div className="bar-col" key={i}>
                <div
                  className={`bar ${Number(c.value) > 99 || Number(c.value) > 6.0 ? 'high' : ''}`}
                  style={{ height: `${Math.max(18, Math.min(100, Number(c.value) * 12))}%` }}
                >
                  <span>{c.value}</span>
                </div>
                <small>{fmtDate(c.date)}</small>
              </div>
            ))}
          </div>
          <div className="chart-legend">
            <span><i className="legend-dot normal"></i> Within Reference Interval</span>
            <span><i className="legend-dot high"></i> Outside Range — Physician Review</span>
          </div>
        </div>
      )}

      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Test Name</th>
              <th>Observed Value</th>
              <th>Reference Interval</th>
              <th>Observed Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {record.labOrders.map(o => (
              <tr key={o.id}>
                <td>
                  <b>{o.testName}</b>
                  <small className="block mono">{o.orderId}</small>
                </td>
                <td>
                  <b>{o.result?.value || 'Pending'} {o.result?.units}</b>
                </td>
                <td>{o.result?.referenceRange || '—'}</td>
                <td>{o.result ? fmtDate(o.result.observedAt) : '—'}</td>
                <td><StatusBadge status={o.result?.status || o.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
