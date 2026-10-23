import crypto from 'node:crypto';
import type { Express } from 'express';
import { extractWithGemini } from './geminiScan.js';
import { searchMedicines } from './medicines.js';
import { ScanError } from './scanSchema.js';

export type ScanCtx = {
  app: Express;
  roles: (...allowed: string[]) => any;
  uploadLimit: any;
  text: (v: any, max?: number) => string;
  audit: (req: any, action: string, entity: string, entityId: string, detail?: string) => void;
  save: () => Promise<void>;
  mongoConnected: () => boolean;
};

/** Report scanning and medicine search. The Gemini key stays on the server. */
export function registerScanRoutes({ app, roles, uploadLimit, text, audit, save, mongoConnected }: ScanCtx) {
  const scanCache = new Map<string, unknown>(); // identical uploads reuse the result instead of spending quota

  app.post('/api/lab/extract', roles('lab'), uploadLimit, async (req: any, res) => {
    const geminiKey = process.env.GEMINI_API_KEY as string;
    if (!geminiKey) return res.status(503).json({ error: 'Report scanning is not configured. Set GEMINI_API_KEY on the server.' });
    const mimeType = text(req.body?.mimeType, 60);
    const data = String(req.body?.data || '').replace(/^data:[^;]+;base64,/, '');
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mimeType) || !data) {
      return res.status(400).json({ error: 'Upload a JPG, PNG, WebP or PDF report' });
    }
    const kb = Math.round((data.length * 0.75) / 1024);
    const fileKey = crypto.createHash('sha256').update(mimeType + data).digest('hex');
    if (scanCache.has(fileKey)) return res.json({ data: scanCache.get(fileKey), cached: true });
    try {
      const parsed = await extractWithGemini(mimeType, data, geminiKey);
      console.log(`[scan] ${parsed.model} -> ok (${mimeType}, ${kb} KB, ${parsed.results.length} rows)`);
      audit(req, 'scan', 'labReport', 'upload', `${mimeType} via ${parsed.model}`);
      scanCache.set(fileKey, parsed);
      if (scanCache.size > 50) scanCache.delete(scanCache.keys().next().value as string);
      await save();
      res.json({ data: parsed });
    } catch (e: any) {
      const status = e instanceof ScanError ? e.status : 503;
      console.log(`[scan] gemini -> ${status} (${mimeType}, ${kb} KB)`);
      res.status(status).json({ error: e instanceof ScanError ? e.message : 'The scanner is unavailable right now, try again shortly.' });
    }
  });

  app.get('/api/medicines/search', roles('doctor'), async (req: any, res) => {
    try {
      res.json(await searchMedicines(String(req.query.q ?? ''), 15, mongoConnected()));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Medicine search failed' });
    }
  });
}
