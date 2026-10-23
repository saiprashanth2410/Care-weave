import { GEMINI_PROMPT, Report, ScanError, normalize } from './scanSchema.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

// Tried in order. Gemma 4 comes first; the Gemini models are fallbacks for when Gemma is busy.
// GEMINI_MODEL, when set, is tried before all of them.
const MODELS = ['gemma-4-26b-a4b-it', 'gemma-4-31b-it', 'gemini-3.6-flash', 'gemini-3.5-flash'];
const ROUNDS = 3;
const REQUEST_TIMEOUT_MS = 45_000;
const BACKOFF_MS = 1_000;

type Outcome = { kind: 'ok'; body: any } | { kind: 'busy' } | { kind: 'rejected' } | { kind: 'quota'; retryAfterSeconds: number };

async function callModel(model: string, mimeType: string, data: string, key: string): Promise<Outcome> {
  const part = mimeType === 'application/pdf' ? { type: 'document', data, mime_type: mimeType } : { type: 'image', data, mime_type: mimeType };
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        model,
        input: [{ type: 'text', text: GEMINI_PROMPT }, part],
        store: false,
        // Gemma spends about a minute reasoning by default; reading printed text does not need it.
        ...(model.startsWith('gemma') ? { generation_config: { thinking_level: 'minimal' } } : {})
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (err: any) {
    console.log(`[scan] ${model} -> ${err?.name || 'error'} (${mimeType})`);
    return { kind: 'busy' };
  }
  console.log(`[scan] ${model} -> HTTP ${res.status} (${mimeType})`);
  if (res.status === 429) return { kind: 'quota', retryAfterSeconds: Number(res.headers.get('retry-after') || 0) };
  if (res.status === 503) return { kind: 'busy' };
  if (!res.ok) return { kind: 'rejected' };
  return { kind: 'ok', body: await res.json() };
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Coerces the model's JSON into the Report shape; a field it got wrong becomes empty rather than failing the scan. */
function toReport(raw: string) {
  let json: any;
  try {
    json = JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
  } catch {
    throw new ScanError(422, 'The scanner returned something unreadable. Enter the results by hand.');
  }
  const j = json && typeof json === 'object' ? json : {};
  const parsed = Report.safeParse({
    patientName: str(j.patientName), patientUhid: str(j.patientUhid), visitNo: str(j.visitNo), labNo: str(j.labNo),
    patientAge: Number(j.patientAge) || 0,
    patientGender: ['M', 'F'].includes(j.patientGender) ? j.patientGender : 'O',
    opIp: j.opIp === 'IP' ? 'IP' : 'OP',
    referralDoctor: str(j.referralDoctor), orderingDoctor: str(j.orderingDoctor), testName: str(j.testName), department: str(j.department),
    priority: j.priority === 'urgent' ? 'urgent' : 'routine',
    impression: str(j.impression),
    results: (Array.isArray(j.results) ? j.results : []).map((x: any) => ({
      parameter: str(x?.parameter), value: str(x?.value), unit: str(x?.unit),
      referenceRange: str(x?.referenceRange), methodology: str(x?.methodology), subGroup: str(x?.subGroup),
      flag: ['abnormal', 'critical'].includes(x?.flag) ? x.flag : 'normal', unclear: x?.unclear === true
    }))
  });
  if (!parsed.success) throw new ScanError(422, 'The scanner returned something unreadable. Enter the results by hand.');
  return normalize(parsed.data);
}

/**
 * Reads a laboratory report through the Gemini API (Interactions endpoint).
 * Models are tried in order; if all are busy the round repeats with exponential backoff.
 * The result names the model that actually read the file.
 */
export async function extractWithGemini(mimeType: string, data: string, key: string) {
  const models = [process.env.GEMINI_MODEL, ...MODELS].filter(Boolean) as string[];
  let busy = false;
  for (let round = 0; round < ROUNDS; round++) {
    if (round) await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS * 2 ** (round - 1)));
    busy = false;
    for (const model of models) {
      const out = await callModel(model, mimeType, data, key);
      if (out.kind === 'quota') {
        const hours = Math.max(1, Math.round(out.retryAfterSeconds / 3600));
        throw new ScanError(429, `The scanner's daily limit is used up. It resets in about ${hours} hour(s). Enter the results by hand, or ask the admin to use another API key.`);
      }
      if (out.kind === 'rejected') throw new ScanError(422, 'The scanner could not read this file');
      if (out.kind === 'busy') { busy = true; continue; }
      const text = (out.body.steps || [])
        .filter((step: any) => step.type === 'model_output')
        .flatMap((step: any) => step.content || [])
        .map((c: any) => c.text ?? '')
        .join('');
      return { ...toReport(text), model };
    }
    if (!busy) break;
  }
  throw new ScanError(busy ? 503 : 422, busy ? 'The scanner is busy, try again shortly' : 'The scanner could not read this file');
}
