import app, { ensureInitialized } from '../careweave/server/dist/index.js';

export default async function handler(req: any, res: any) {
  try {
    // Normalize URL path for Express routing
    if (req.url && !req.url.startsWith('/api')) {
      req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }
    await ensureInitialized();
    return app(req, res);
  } catch (err: any) {
    console.error('API Error in Vercel Serverless Function:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err?.message });
  }
}

