import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, startInstance } from './testing.js';

const person = { name: 'Audit Subject', dob: '1991-02-03', gender: 'Female', phone: '+91 90000 11111', address: 'Chennai' };

async function setup() {
  const srv = await startInstance(await memoryStore());
  const reception = await srv.login('reception');
  const doctor = await srv.login('admin');
  const patient = (await srv.call('POST', '/api/patients', { token: reception, body: person })).json;
  return { srv, reception, doctor, patient };
}

test('audit log: only staff with the audit permission can read it', async () => {
  const { srv, reception, doctor } = await setup();
  try {
    assert.equal((await srv.call('GET', '/api/audit')).status, 401);
    assert.equal((await srv.call('GET', '/api/audit', { token: reception })).status, 403);
    const ok = await srv.call('GET', '/api/audit', { token: doctor });
    assert.equal(ok.status, 200);
    assert.ok(ok.json.rows.length > 0);
  } finally { await srv.close(); }
});

test('audit log: entries name the actor, filter by action, and page backwards', async () => {
  const { srv, reception, doctor, patient } = await setup();
  try {
    await srv.call('GET', `/api/patients/${patient.id}/admin`, { token: reception });
    const all = (await srv.call('GET', '/api/audit?limit=200', { token: doctor })).json.rows;
    const create = all.find((r: any) => r.action === 'create' && r.entity === 'patient');
    assert.equal(create.actorName, 'Maya Patel');
    assert.equal(create.actorRole, 'receptionist');
    const reads = (await srv.call('GET', '/api/audit?action=read&entity=patient', { token: doctor })).json.rows;
    assert.ok(reads.length >= 1 && reads.every((r: any) => r.action === 'read' && r.entity === 'patient'));
    const first = await srv.call('GET', '/api/audit?limit=1', { token: doctor });
    assert.equal(first.json.rows.length, 1);
    const next = await srv.call('GET', `/api/audit?limit=1&before=${encodeURIComponent(first.json.nextBefore)}`, { token: doctor });
    assert.ok(next.json.rows.every((r: any) => r.timestamp < first.json.nextBefore));
  } finally { await srv.close(); }
});

test('access log: shows who touched one patient, by id or UHID, and not other patients', async () => {
  const { srv, reception, doctor, patient } = await setup();
  try {
    const other = (await srv.call('POST', '/api/patients', { token: reception, body: { ...person, name: 'Someone Else', phone: '+91 90000 22222' } })).json;
    await srv.call('GET', `/api/patients/${patient.id}/admin`, { token: reception });
    await srv.call('GET', `/api/patients/${other.id}/admin`, { token: reception });
    assert.equal((await srv.call('GET', `/api/patients/${patient.id}/access-log`, { token: reception })).status, 403);
    const byId = await srv.call('GET', `/api/patients/${patient.id}/access-log`, { token: doctor });
    const byCode = await srv.call('GET', `/api/patients/${patient.patientId}/access-log`, { token: doctor });
    assert.equal(byId.status, 200);
    assert.equal(byCode.json.patient.id, patient.id);
    assert.ok(byId.json.rows.length >= 2 && byId.json.rows.every((r: any) => r.entity === 'patient' && r.entityId === patient.id));
    assert.equal((await srv.call('GET', '/api/patients/nope/access-log', { token: doctor })).status, 404);
  } finally { await srv.close(); }
});

test('audit log: reading it is recorded, once per minute for the same query', async () => {
  const { srv, doctor } = await setup();
  try {
    await srv.call('GET', '/api/audit', { token: doctor });
    await srv.call('GET', '/api/audit', { token: doctor });
    const reads = (await srv.call('GET', '/api/audit?entity=audit-log&limit=50', { token: doctor })).json.rows.filter((r: any) => r.detail === 'Viewed the audit log');
    assert.equal(reads.length, 1);
  } finally { await srv.close(); }
});
