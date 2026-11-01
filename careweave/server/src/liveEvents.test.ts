import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addClient, broadcast, connectedCount } from './liveEvents.js';

const fakeRes = () => {
  const written: string[] = [];
  const handlers: Record<string, () => void> = {};
  const res: any = {
    status() { return res; }, set() { return res; },
    write: (s: string) => { written.push(s); return true; },
    on: (e: string, f: () => void) => { handlers[e] = f; },
  };
  return { res, written, close: () => handlers.close?.() };
};

test('a critical alert reaches only the doctors it is meant for, and a closed screen is dropped', () => {
  const a = fakeRes(), b = fakeRes();
  addClient(a.res, 'doc-1', 'doctor');
  addClient(b.res, 'doc-2', 'doctor');
  broadcast('critical', { patientName: 'X' }, (id) => id === 'doc-1');
  assert.ok(a.written.some((w) => w.startsWith('event: critical')));
  assert.ok(!b.written.some((w) => w.includes('critical')));
  const before = connectedCount();
  a.close();
  assert.equal(connectedCount(), before - 1);
  b.close();
});
