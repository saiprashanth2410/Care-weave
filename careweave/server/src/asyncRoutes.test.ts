import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { catchAsyncRoutes } from './asyncRoutes.js';

// Regression: ISSUE-001 — a non-string "name" made an async handler throw and killed the whole server process.
// Found by /qa on 2026-11-01
test('a throwing async handler becomes a 500 instead of crashing the process', async () => {
  const app = express();
  catchAsyncRoutes(app);
  app.use(express.json());
  app.post('/boom', async (req) => { (req.body.name as string).trim(); });
  app.use((_err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: 'handled' }));
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/boom`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 123 }),
    });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: 'handled' });
    assert.equal((await fetch(`http://127.0.0.1:${port}/boom`, { method: 'POST' })).status, 500, 'server still serving');
  } finally {
    server.close();
  }
});
