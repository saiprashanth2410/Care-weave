import { GEMINI_PROMPT, Report, ScanError, normalize } from './scanSchema.js';

// Gemini fallback. Newer accounts use the Interactions API. If one model is overloaded, the next one is tried.
export async function extractWithGemini(mimeType: string, data: string, key: string) {
  const part = mimeType === 'application/pdf' ? { type: 'document', data, mime_type: mimeType } : { type: 'image', data, mime_type: mimeType };
  const models = [process.env.GEMINI_MODEL, 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.8-flash'].filter(Boolean) as string[];
  let busy = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    busy = false;
    for (const model of models) {
      let r: Response;
      try {
        r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ model, input: [{ type: 'text', text: GEMINI_PROMPT }, part], store: false }),
          signal: AbortSignal.timeout(45000)
        });
      } catch {
        busy = true; // timed out or unreachable: try the next model
        continue;
      }
      console.log(`[scan] ${model} -> HTTP ${r.status} (${mimeType})`);
      if (r.status === 429) {
        const hours = Math.max(1, Math.round(Number(r.headers.get('retry-after') || 0) / 3600));
        throw new ScanError(429, `The scanner's free daily limit is used up. It resets in about ${hours} hour(s). Enter the results by hand, or ask the admin to use another API key.`);
      }
      if (r.status === 503) { busy = true; continue; }
      if (!r.ok) throw new ScanError(422, 'The scanner could not read this file');
      const body: any = await r.json();
      const raw = (body.steps || [])
        .filter((st: any) => st.type === 'model_output')
        .flatMap((st: any) => st.content || [])
        .map((c: any) => c.text ?? '')
        .join('')
        .replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '');
      let json: unknown;
      try { json = JSON.parse(raw); } catch { throw new ScanError(422, 'The scanner returned something unreadable. Enter the results by hand.'); }
      // Coerce what the model returned, then check the shape, so a half-formed answer never reaches the form.
      const j: any = json && typeof json === 'object' ? json : {};
      const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
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
    if (!busy) break;
    await new Promise((res) => setTimeout(res, 2500)); // every model was busy: wait briefly, then try the list once more
  }
  throw new ScanError(busy ? 503 : 422, busy ? 'The scanner is busy, try again shortly' : 'The scanner could not read this file');
}
