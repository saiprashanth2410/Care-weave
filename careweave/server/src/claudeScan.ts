import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const Report = z.object({
  patientName: z.string(),
  patientUhid: z.string(),
  visitNo: z.string(),
  labNo: z.string(),
  patientAge: z.number(),
  patientGender: z.enum(['M', 'F', 'O']),
  opIp: z.enum(['OP', 'IP']),
  referralDoctor: z.string(),
  orderingDoctor: z.string(),
  testName: z.string(),
  department: z.string(),
  priority: z.enum(['routine', 'urgent']),
  impression: z.string(),
  results: z.array(
    z.object({
      parameter: z.string(),
      value: z.string(),
      unit: z.string(),
      referenceRange: z.string(),
      methodology: z.string(),
      subGroup: z.string(),
      flag: z.enum(['normal', 'abnormal', 'critical'])
    })
  )
});

const PROMPT = `You are a clinical laboratory document parser.
Read this laboratory report and extract only what is printed on it.
Use "" or 0 for anything that is not printed. Never invent a value, name or reference range.
Copy values and units exactly as printed. Set "flag" from the report's own markers (H, L, *, bold, "critical");
use "normal" when the report shows no marker.`;

export class ScanError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Model is overridable. Reading a printed report does not need heavy reasoning, so effort stays low.
export async function extractWithClaude(mimeType: string, data: string) {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const source =
    mimeType === 'application/pdf'
      ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } as const)
      : ({ type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data } } as const);
  try {
    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
      max_tokens: 16000,
      messages: [{ role: 'user', content: [source, { type: 'text', text: PROMPT }] }],
      output_config: { effort: 'low', format: zodOutputFormat(Report) }
    });
    if (response.stop_reason === 'refusal') throw new ScanError(422, 'The scanner declined to read this file');
    if (!response.parsed_output) throw new ScanError(422, 'The scanner returned something unreadable. Enter the results by hand.');
    return response.parsed_output;
  } catch (err) {
    if (err instanceof ScanError) throw err;
    if (err instanceof Anthropic.RateLimitError) throw new ScanError(429, 'The scanner is rate limited, try again in a minute.');
    if (err instanceof Anthropic.AuthenticationError) throw new ScanError(503, 'The scanner key is not valid. Ask the admin to check ANTHROPIC_API_KEY.');
    if (err instanceof Anthropic.BadRequestError) throw new ScanError(422, 'The scanner could not read this file');
    if (err instanceof Anthropic.APIError) throw new ScanError(503, 'The scanner is unavailable right now, try again shortly.');
    throw new ScanError(503, 'The scanner is unavailable right now, try again shortly.');
  }
}
