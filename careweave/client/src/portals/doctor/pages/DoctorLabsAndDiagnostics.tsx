import { useEffect, useState } from 'react';
import { Clock3, Plus, Search } from '../icons';
import { api } from '../api';
import type { LabOrder, Patient } from '../types';
import { fmtDate } from '../helpers';
import { PageHeader, StatusBadge, Modal } from '../components';

export function DoctorLabsAndDiagnostics({
  notify,
  onOrderTest,
  onOpenPatient: _onOpenPatient
}: {
  notify: (s: string) => void;
  onOrderTest: () => void;
  onOpenPatient: (p: Patient) => void;
}) {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(null);

  const load = () => {
    api.labOrders().then(setOrders).catch(e => notify(e.message));
    api.patients().then(setPatients).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const shown = q
    ? orders.filter(o => [o.testName, o.patientName, o.orderId, o.status].some(v => String(v || '').toLowerCase().includes(q.toLowerCase())))
    : orders;

  return (
    <>
      <PageHeader
        eyebrow="Diagnostic Operations"
        title="Diagnostic & Laboratory Center"
        sub="Review released laboratory findings, trend analyses, and place physician test orders."
        action={
          <button className="primary" onClick={onOrderTest}>
            <Plus size={16} /> Order Diagnostic Test / Imaging
          </button>
        }
      />

      <div className="toolbar toolbar-row">
        <div className="search">
          <Search size={17} />
          <input
            placeholder="Search test name, patient, or order ID"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <span className="muted">{orders.length} authorized test orders</span>
      </div>

      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Order ID · Priority</th>
              <th>Patient</th>
              <th>Test Name</th>
              <th>Sample Type</th>
              <th>Requested</th>
              <th>Result Value</th>
              <th>Workflow Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(o => (
              <tr key={o.id}>
                <td>
                  <span className="mono">{o.orderId}</span>
                  <small className="block">{o.priority || 'Routine'}</small>
                </td>
                <td>
                  <b>{o.patientName}</b>
                  <small className="mono block">{o.patientIdCode}</small>
                </td>
                <td><b>{o.testName}</b></td>
                <td>{o.sampleType}</td>
                <td>{fmtDate(o.requestedAt)}</td>
                <td>
                  {o.result ? (
                    <div>
                      <b style={{ color: Number(o.result.value) > 99 ? '#7d5200' : 'inherit' }}>
                        {o.result.value} {o.result.units}
                      </b>
                      <small className="block">Ref: {o.result.referenceRange}</small>
                    </div>
                  ) : (
                    <span className="muted">Pending result</span>
                  )}
                </td>
                <td><StatusBadge status={o.status} /></td>
                <td>
                  <div className="row-actions">
                    <button className="secondary small-btn" onClick={() => setSelectedOrder(o)}>
                      Inspect
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <Modal
          title={`Order ${selectedOrder.orderId}: ${selectedOrder.testName}`}
          sub={`Patient: ${selectedOrder.patientName} · Status: ${selectedOrder.status}`}
          onClose={() => setSelectedOrder(null)}
        >
          <div className="result-context">
            <div>
              <span>Patient</span>
              <b>{selectedOrder.patientName}</b>
            </div>
            <div>
              <span>Sample Specimen</span>
              <b>{selectedOrder.sampleType}</b>
            </div>
            <div>
              <span>Status</span>
              <StatusBadge status={selectedOrder.status} />
            </div>
          </div>

          {selectedOrder.result ? (
            <div className="card" style={{ background: '#f6f7f3', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Reported Value:</span>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)' }}>
                    {selectedOrder.result.value} {selectedOrder.result.units}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Reference Interval:</span>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {selectedOrder.result.referenceRange}
                  </div>
                </div>
              </div>
              {selectedOrder.result.comments && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink)' }}>
                  <b>Lab Comments:</b> {selectedOrder.result.comments}
                </div>
              )}
            </div>
          ) : (
            <div className="notice" style={{ marginBottom: 16 }}>
              <Clock3 size={16} /> Order has been transmitted to diagnostics laboratory. Specimen processing in progress.
            </div>
          )}

          <div className="modal-actions">
            <button className="primary" onClick={() => setSelectedOrder(null)}>Done</button>
          </div>
        </Modal>
      )}
    </>
  );
}
