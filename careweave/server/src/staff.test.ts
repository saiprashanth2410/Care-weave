import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, startInstance } from './testing.js';

async function setup() {
  const srv = await startInstance(await memoryStore());
  return { srv, admin: await srv.login('admin'), reception: await srv.login('reception') };
}
const newDoc = { name: 'Dr. New Hire', email: 'New.Hire@careweave.test', role: 'doctor', facility: 'OPD', password: 'welcome-123' };

test('staff: only administrators can list or change accounts, and hashes never leave the server', async () => {
  const { srv, admin, reception } = await setup();
  try {
    assert.equal((await srv.call('GET', '/api/staff')).status, 401);
    assert.equal((await srv.call('GET', '/api/staff', { token: reception })).status, 403);
    assert.equal((await srv.call('POST', '/api/staff', { token: reception, body: newDoc })).status, 403);
    const list = await srv.call('GET', '/api/staff', { token: admin });
    assert.equal(list.status, 200);
    assert.ok(list.json.length >= 4);
    assert.ok(!list.text.includes('passwordHash') && !list.text.includes('$2a$'));
  } finally { await srv.close(); }
});

test('staff: a created account can sign in with the role it was given, and its email is stored lower-case', async () => {
  const { srv, admin } = await setup();
  try {
    const made = await srv.call('POST', '/api/staff', { token: admin, body: newDoc });
    assert.equal(made.status, 201, JSON.stringify(made.json));
    assert.equal(made.json.email, 'new.hire@careweave.test');
    assert.deepEqual(made.json.permissions, ['consult', 'prescribe', 'diagnose']);
    const login = await srv.call('POST', '/api/auth/login', { body: { email: 'new.hire@careweave.test', password: 'welcome-123' } });
    assert.equal(login.status, 200);
    assert.equal(login.json.user.role, 'doctor');
    assert.equal((await srv.call('POST', '/api/staff', { token: admin, body: newDoc })).status, 409);
    assert.equal((await srv.call('POST', '/api/staff', { token: admin, body: { ...newDoc, email: 'x@y.test', role: 'root' } })).status, 400);
    assert.equal((await srv.call('POST', '/api/staff', { token: admin, body: { ...newDoc, email: 'z@y.test', password: 'short' } })).status, 400);
  } finally { await srv.close(); }
});

test('staff: a new lab account cannot verify results until an administrator grants it, and unknown permissions are dropped', async () => {
  const { srv, admin } = await setup();
  try {
    const lab = (await srv.call('POST', '/api/staff', { token: admin, body: { name: 'New Tech', email: 'tech@careweave.test', role: 'lab' } })).json;
    assert.ok(!lab.permissions.includes('verify'));
    const up = await srv.call('PATCH', `/api/staff/${lab.id}`, { token: admin, body: { permissions: ['verify', 'analyze', 'launch-rockets'] } });
    assert.deepEqual(up.json.permissions, ['verify', 'analyze']);
    assert.equal(up.json.localLogin, false); // no password was set: Firebase sign-in only
  } finally { await srv.close(); }
});

test('staff: disabling an account ends its session at once and blocks a new sign-in; enabling restores it', async () => {
  const { srv, admin } = await setup();
  try {
    const rec = (await srv.call('GET', '/api/staff', { token: admin })).json.find((u: any) => u.email === 'reception@careweave.test');
    const session = await srv.login('reception');
    assert.equal((await srv.call('GET', '/api/me', { token: session })).status, 200);
    assert.equal((await srv.call('PATCH', `/api/staff/${rec.id}`, { token: admin, body: { active: false } })).status, 200);
    assert.equal((await srv.call('GET', '/api/me', { token: session })).status, 401);
    const blocked = await srv.call('POST', '/api/auth/login', { body: { email: 'reception@careweave.test', password: 'demo123' } });
    assert.equal(blocked.status, 403);
    assert.match(blocked.json.error, /disabled/);
    await srv.call('PATCH', `/api/staff/${rec.id}`, { token: admin, body: { active: true } });
    assert.equal((await srv.call('POST', '/api/auth/login', { body: { email: 'reception@careweave.test', password: 'demo123' } })).status, 200);
  } finally { await srv.close(); }
});

test('staff: an administrator cannot change or lock out their own account', async () => {
  const { srv, admin } = await setup();
  try {
    const me = (await srv.call('GET', '/api/me', { token: admin })).json;
    for (const body of [{ active: false }, { role: 'doctor' }, { permissions: [] }]) {
      assert.equal((await srv.call('PATCH', `/api/staff/${me.id}`, { token: admin, body })).status, 400);
    }
    assert.equal((await srv.call('PATCH', `/api/staff/${me.id}`, { token: admin, body: { name: 'Ravi M' } })).status, 200);
  } finally { await srv.close(); }
});

test('staff: a role change resets permissions to that role, a password reset works, and the audit log never holds a password', async () => {
  const { srv, admin } = await setup();
  try {
    const u = (await srv.call('POST', '/api/staff', { token: admin, body: { ...newDoc, email: 'swap@careweave.test' } })).json;
    const moved = await srv.call('PATCH', `/api/staff/${u.id}`, { token: admin, body: { role: 'receptionist', password: 'brand-new-pass' } });
    assert.equal(moved.json.role, 'receptionist');
    assert.deepEqual(moved.json.permissions, ['register', 'triage', 'queue']);
    assert.equal((await srv.call('POST', '/api/auth/login', { body: { email: 'swap@careweave.test', password: 'welcome-123' } })).status, 401);
    assert.equal((await srv.call('POST', '/api/auth/login', { body: { email: 'swap@careweave.test', password: 'brand-new-pass' } })).status, 200);
    const log = (await srv.call('GET', '/api/audit?entity=staff&limit=50', { token: admin })).text;
    assert.ok(log.includes('role doctor → receptionist'));
    assert.ok(!log.includes('welcome-123') && !log.includes('brand-new-pass'));
  } finally { await srv.close(); }
});

test('admin role: sees staff and audit, never patients or the clinical dashboard', async () => {
  const { srv, admin } = await setup();
  try {
    for (const path of ['/api/patients', '/api/dashboard', '/api/appointments', '/api/lab/orders', '/api/referrals']) {
      assert.equal((await srv.call('GET', path, { token: admin })).status, 403, path);
    }
    assert.equal((await srv.call('GET', '/api/audit', { token: admin })).status, 200);
  } finally { await srv.close(); }
});

/** A Firebase stand-in that remembers what the server asked it to do. */
function fakeFirebase(opts: { failCreate?: boolean; existing?: string[] } = {}) {
  const accounts = new Map<string, { password: string; disabled: boolean }>((opts.existing || []).map((e) => [e, { password: 'theirs', disabled: false }]));
  const fb = {
    configured: true,
    accounts,
    async create({ email, password }: { email: string; name: string; password: string }) {
      if (opts.failCreate) throw new Error('boom');
      if (accounts.has(email)) return { uid: `uid-${email}`, existed: true };
      accounts.set(email, { password, disabled: false });
      return { uid: `uid-${email}`, existed: false };
    },
    async setDisabled(email: string, disabled: boolean) { const a = accounts.get(email); if (a) a.disabled = disabled; },
    async setPassword(email: string, password: string) { const a = accounts.get(email); if (a) a.password = password; },
    async resetLink(email: string) { return `https://example.test/reset?e=${encodeURIComponent(email)}`; },
    async remove(email: string) { accounts.delete(email); },
  };
  return fb;
}

async function withFirebase(fb: ReturnType<typeof fakeFirebase>) {
  const srv = await startInstance(await memoryStore(), { firebaseUsers: fb });
  return { srv, admin: await srv.login('admin') };
}

test('firebase: a new staff member gets a Firebase account with a one-time password, never stored or logged', async () => {
  const fb = fakeFirebase();
  const { srv, admin } = await withFirebase(fb);
  try {
    assert.equal((await srv.call('GET', '/api/staff/catalog', { token: admin })).json.firebase, true);
    const made = await srv.call('POST', '/api/staff', { token: admin, body: { name: 'Front Desk Two', email: 'Desk2@Hospital.test', role: 'receptionist' } });
    assert.equal(made.status, 201, JSON.stringify(made.json));
    assert.equal(made.json.firebase, 'created');
    const pw = made.json.temporaryPassword;
    assert.ok(typeof pw === 'string' && pw.length >= 14);
    assert.equal(fb.accounts.get('desk2@hospital.test')?.password, pw);
    const listed = (await srv.call('GET', '/api/staff', { token: admin })).text;
    const log = (await srv.call('GET', '/api/audit?entity=staff', { token: admin })).text;
    assert.ok(!listed.includes(pw) && !log.includes(pw));
    assert.equal(made.json.localLogin, false);
  } finally { await srv.close(); }
});

test('firebase: an address that already has a Firebase account is linked, and no password is handed out', async () => {
  const { srv, admin } = await withFirebase(fakeFirebase({ existing: ['already@hospital.test'] }));
  try {
    const made = await srv.call('POST', '/api/staff', { token: admin, body: { name: 'Already There', email: 'already@hospital.test', role: 'lab' } });
    assert.equal(made.json.firebase, 'existing');
    assert.equal(made.json.temporaryPassword, undefined);
  } finally { await srv.close(); }
});

test('firebase: if Firebase refuses, no staff record is saved', async () => {
  const bad = fakeFirebase({ failCreate: true });
  const a = await withFirebase(bad);
  try {
    const r = await a.srv.call('POST', '/api/staff', { token: a.admin, body: { name: 'Nope Person', email: 'nope@hospital.test', role: 'doctor' } });
    assert.equal(r.status, 502);
    assert.ok(!(await a.srv.call('GET', '/api/staff', { token: a.admin })).text.includes('nope@hospital.test'));
  } finally { await a.srv.close(); }
});

test('firebase: disabling or re-enabling mirrors to Firebase, a password reset changes it there, and reset links come from Firebase', async () => {
  const fb = fakeFirebase();
  const { srv, admin } = await withFirebase(fb);
  try {
    const u = (await srv.call('POST', '/api/staff', { token: admin, body: { name: 'Mirror Me', email: 'mirror@hospital.test', role: 'receptionist' } })).json;
    await srv.call('PATCH', `/api/staff/${u.id}`, { token: admin, body: { active: false } });
    assert.equal(fb.accounts.get('mirror@hospital.test')?.disabled, true);
    await srv.call('PATCH', `/api/staff/${u.id}`, { token: admin, body: { active: true } });
    assert.equal(fb.accounts.get('mirror@hospital.test')?.disabled, false);
    await srv.call('PATCH', `/api/staff/${u.id}`, { token: admin, body: { password: 'chosen-by-admin-1' } });
    assert.equal(fb.accounts.get('mirror@hospital.test')?.password, 'chosen-by-admin-1');
    const link = await srv.call('POST', `/api/staff/${u.id}/reset-link`, { token: admin });
    assert.match(link.json.link, /reset\?e=mirror%40hospital\.test/);
    const log = (await srv.call('GET', '/api/audit?entity=staff', { token: admin })).text;
    assert.ok(!log.includes('chosen-by-admin-1') && !log.includes('example.test/reset'));
  } finally { await srv.close(); }
});

test('firebase: without a service account the record is still saved and the response says Firebase was not touched', async () => {
  const { srv, admin } = await setup();
  try {
    assert.equal((await srv.call('GET', '/api/staff/catalog', { token: admin })).json.firebase, false);
    const made = await srv.call('POST', '/api/staff', { token: admin, body: { name: 'No Firebase', email: 'nofb@hospital.test', role: 'receptionist' } });
    assert.equal(made.status, 201);
    assert.equal(made.json.firebase, 'not-configured');
    assert.equal((await srv.call('POST', `/api/staff/${made.json.id}/reset-link`, { token: admin })).status, 400);
  } finally { await srv.close(); }
});

test('a disabled doctor no longer appears in the booking list', async () => {
  const { srv, admin, reception } = await setup();
  try {
    const doctors = (await srv.call('GET', '/api/doctors', { token: reception })).json;
    const d = (await srv.call('GET', '/api/staff', { token: admin })).json.find((u: any) => u.role === 'doctor');
    assert.ok(doctors.some((x: any) => x.id === d.id));
    await srv.call('PATCH', `/api/staff/${d.id}`, { token: admin, body: { active: false } });
    assert.ok(!(await srv.call('GET', '/api/doctors', { token: reception })).json.some((x: any) => x.id === d.id));
  } finally { await srv.close(); }
});
