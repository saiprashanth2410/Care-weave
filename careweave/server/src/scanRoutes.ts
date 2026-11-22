import crypto from 'node:crypto';
import type { IRouter } from 'express';
import type { Repos } from './repo/index.js';
import { extractWithGemini } from './geminiScan.js';
import { searchMedicines } from './medicines.js';
import { ScanError } from './scanSchema.js';
import { readAiConfig } from './services/aiConfig.js';
import { asError } from './errors.js';
import type { Request } from 'express';

export type ScanCtx = {
  app: IRouter;
  roles: (...allowed: string[]) => any;
  uploadLimit: any;
  text: (v: any, max?: number) => string;
  audit: (req: Request, action: string, entity: string, entityId: string, detail?: string) => Promise<void>;
  repos: () => Repos;
};

/** Report scanning and medicine search. The Gemini key stays on the server. */
export function registerScanRoutes({ app, roles, uploadLimit, text, audit, repos }: ScanCtx) {
  const scanCache = new Map<string, unknown>(); // identical uploads reuse the result instead of spending quota

  app.post('/lab/extract', roles('lab'), uploadLimit, async (req, res) => {
    const ai = await readAiConfig(repos());
    if (!ai.features.scan) return res.status(503).json({ error: 'Report scanning is switched off. Ask the administrator to turn it on.' });
    const geminiKey = ai.key;
    if (!geminiKey) return res.status(503).json({ error: 'Report scanning is not set up yet. Ask the administrator to add the Gemini API key in the admin portal.' });
    const mimeType = text(req.body?.mimeType, 60);
    const data = String(req.body?.data || '').replace(/^data:[^;]+;base64,/, '');
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mimeType) || !data) {
      return res.status(400).json({ error: 'Upload a JPG, PNG, WebP or PDF report' });
    }
    const kb = Math.round((data.length * 0.75) / 1024);
    const fileKey = crypto.createHash('sha256').update(mimeType + data).digest('hex');
    if (scanCache.has(fileKey)) return res.json({ data: scanCache.get(fileKey), cached: true });
    try {
      const parsed = await extractWithGemini(mimeType, data, geminiKey, ai.model || undefined);
      console.log(`[scan] ${parsed.model} -> ok (${mimeType}, ${kb} KB, ${parsed.results.length} rows)`);
      await audit(req, 'scan', 'labReport', 'upload', `${mimeType} via ${parsed.model}`);
      scanCache.set(fileKey, parsed);
      if (scanCache.size > 50) scanCache.delete(scanCache.keys().next().value as string);
      res.json({ data: parsed });
    } catch (e) {
      const status = e instanceof ScanError ? e.status : 503;
      console.log(`[scan] gemini -> ${status} (${mimeType}, ${kb} KB)`);
      res.status(status).json({ error: e instanceof ScanError ? e.message : 'The scanner is unavailable right now, try again shortly.' });
    }
  });

  app.get('/medicines/search', roles('doctor'), async (req, res) => {
    try {
      res.json(await searchMedicines(String(req.query.q ?? ''), 15, repos().mode === 'mongo'));
    } catch (err) {
      res.status(500).json({ error: asError(err).message || 'Medicine search failed' });
    }
  });
}
