import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { MODELS } from '../clinicalSummary.js';
import { rateLimit } from '../middleware.js';
import { AiConfigError, aiStatus, changePasscode, readAiConfig, removeKey, revealKey, setKey, setOptions, validKey } from '../services/aiConfig.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/** Asks one model one tiny question, to learn whether the key works. */
async function probe(key: string, model: string): Promise<'ok' | 'invalid' | 'quota' | 'other'> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ model, input: [{ type: 'text', text: 'Reply with the single word CONNECTED' }], store: false }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return 'ok';
    if (res.status === 429) return 'quota';
    if ([400, 401, 403].includes(res.status)) {
      const body: any = await res.json().catch(() => ({}));
      return /API key|API_KEY|permission|PERMISSION/i.test(JSON.stringify(body)) ? 'invalid' : 'other';
    }
    return 'other';
  } catch {
    return 'other';
  }
}

/** The Gemini key the scanner and the brief use. Administrators only; the key is never returned except after the passcode. */
export function integrationRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);
  const { roles, audit } = ctx;
  const R = () => ctx.repos;
  const admin = [
    roles('admin'),
    (req: any, res: any, next: any) => ((req.user.permissions || []).includes('staff') ? next() : res.status(403).json({ error: 'Managing integrations needs the staff permission' })),
  ];
  const tries = rateLimit(() => ctx.repos, 'ai-config', 10 * 60 * 1000, 30, (r) => r.user?.id || r.ip);
  const fail = (res: any, e: unknown) => {
    if (e instanceof AiConfigError) return res.status(e.status).json({ error: e.message });
    throw e;
  };
  const who = (req: any) => `${req.user.name} (${req.user.id})`;

  router.get('/integrations/gemini', ...admin, async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await aiStatus(R()));
  });

  router.put('/integrations/gemini', ...admin, tries, async (req: any, res) => {
    try {
      const first = !(await aiStatus(R())).hasPasscode;
      await setKey(R(), who(req), { apiKey: req.body?.apiKey, passcode: req.body?.passcode });
      await audit(req, 'update', 'integration', 'gemini', first ? 'Set the Gemini API key and its passcode' : 'Replaced the Gemini API key');
      res.json(await aiStatus(R()));
    } catch (e) { fail(res, e); }
  });

  router.post('/integrations/gemini/unlock', ...admin, tries, async (req: any, res) => {
    try {
      const key = await revealKey(R(), req.body?.passcode);
      await audit(req, 'read', 'integration', 'gemini', 'Unlocked the Gemini API key');
      res.set('Cache-Control', 'no-store').json({ apiKey: key });
    } catch (e) { fail(res, e); }
  });

  router.post('/integrations/gemini/passcode', ...admin, tries, async (req: any, res) => {
    try {
      await changePasscode(R(), who(req), { currentPasscode: req.body?.currentPasscode, newPasscode: req.body?.newPasscode });
      await audit(req, 'update', 'integration', 'gemini', 'Changed the passcode that protects the Gemini API key');
      res.json(await aiStatus(R()));
    } catch (e) { fail(res, e); }
  });

  router.delete('/integrations/gemini', ...admin, tries, async (req: any, res) => {
    try {
      await removeKey(R(), req.body?.passcode);
      await audit(req, 'delete', 'integration', 'gemini', 'Removed the Gemini API key');
      res.json(await aiStatus(R()));
    } catch (e) { fail(res, e); }
  });

  router.patch('/integrations/gemini/options', ...admin, async (req: any, res) => {
    try {
      const b = req.body ?? {};
      await setOptions(R(), who(req), { scan: b.scan, brief: b.brief, model: b.model });
      const bits = [typeof b.scan === 'boolean' && `report scanner ${b.scan ? 'on' : 'off'}`, typeof b.brief === 'boolean' && `doctor brief ${b.brief ? 'on' : 'off'}`, b.model !== undefined && `model "${String(b.model).slice(0, 60) || 'automatic'}"`].filter(Boolean);
      await audit(req, 'update', 'integration', 'gemini', `Gemini settings: ${bits.join(', ') || 'no change'}`);
      res.json(await aiStatus(R()));
    } catch (e) { fail(res, e); }
  });

  // Tests the key typed in the box, or the saved one when the box is empty.
  router.post('/integrations/gemini/test', ...admin, tries, async (req: any, res) => {
    const typed = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    if (typed && !validKey(typed)) return res.json({ ok: false, error: 'That does not look like a Gemini API key.' });
    const cfg = await readAiConfig(R());
    const key = typed || cfg.key;
    if (!key) return res.json({ ok: false, error: 'There is no key to test. Paste one first.' });
    const started = Date.now();
    let last: Awaited<ReturnType<typeof probe>> = 'other';
    for (const model of [cfg.model, ...MODELS].filter(Boolean)) {
      last = await probe(key, model);
      if (last === 'ok') {
        await audit(req, 'test', 'integration', 'gemini', 'Tested the Gemini connection: passed');
        return res.json({ ok: true, model, ms: Date.now() - started });
      }
      if (last === 'invalid' || last === 'quota') break;
    }
    await audit(req, 'test', 'integration', 'gemini', `Tested the Gemini connection: ${last}`);
    res.json({
      ok: false,
      error: last === 'invalid' ? 'Google did not accept this key. Check it in Google AI Studio.'
        : last === 'quota' ? 'The key works but its daily limit is used up.'
          : 'Google did not answer. Try again in a moment.',
    });
  });

  return router;
}
