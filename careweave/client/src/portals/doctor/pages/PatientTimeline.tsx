import { useState } from 'react';
import { ClipboardList, FileText, FlaskConical, RefreshCw, Stethoscope, Activity } from '../icons';
import type { PatientRecord } from '../types';
import { fmtDate } from '../helpers';
import { StatusBadge } from '../components';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export function TimelineView({ record }: { record: PatientRecord }) {
  const [filterType, setFilterType] = useState('all');

  const shown = filterType === 'all'
    ? record.timeline
    : record.timeline.filter(e => e.type.toLowerCase().includes(filterType.toLowerCase()));

  // Extract longitudinal vitals for interactive trend chart
  const vitalsTrend = (record.vitals || []).map(v => {
    return {
      date: fmtDate(v.date),
      systolic: v.bpSystolic ? Number(v.bpSystolic) : null,
      diastolic: v.bpDiastolic ? Number(v.bpDiastolic) : null,
      heartRate: v.heartRate ? Number(v.heartRate) : null,
      temp: v.tempF ? Number(v.tempF) : null,
      spO2: v.spo2 ? Number(v.spo2) : null
    };
  }).reverse();

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

      {/* Interactive Vitals Trend Chart */}
      {vitalsTrend.length > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={18} style={{ color: '#0c6b6d' }} />
              <div>
                <b style={{ fontSize: 13, color: '#14231f' }}>Longitudinal Physiological Vitals Trend</b>
                <div style={{ fontSize: 11, color: '#56655f' }}>Interactive timeline monitoring Blood Pressure (mmHg) & Heart Rate (bpm) across encounters</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#56655f' }}>
              <span><span style={{ color: '#0c6b6d', fontWeight: 'bold' }}>●</span> Systolic BP</span>
              <span><span style={{ color: '#7d5200', fontWeight: 'bold' }}>●</span> Diastolic BP</span>
              <span><span style={{ color: '#a3341f', fontWeight: 'bold' }}>●</span> Heart Rate</span>
            </div>
          </div>
          <div style={{ height: 160, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={vitalsTrend} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e1e5df" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#56655f' }} />
                <YAxis domain={[40, 180]} tick={{ fontSize: 10, fill: '#56655f' }} />
                <Tooltip contentStyle={{ background: '#f6f7f3', border: '1px solid #c3cac2', fontSize: 12, borderRadius: 4 }} />
                <Line type="monotone" dataKey="systolic" stroke="#0c6b6d" strokeWidth={2} name="Systolic BP (mmHg)" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="diastolic" stroke="#7d5200" strokeWidth={2} name="Diastolic BP (mmHg)" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="heartRate" stroke="#a3341f" strokeWidth={1.5} strokeDasharray="4 4" name="Heart Rate (bpm)" dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

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
