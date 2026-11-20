/**
 * Photos sent in chats (a prescription, a lab report, a skin problem) arrive as a data URL that the browser already shrank.
 * This accepts only JPEG, PNG or WebP, checks the bytes really are that format (the label alone proves nothing), and caps the size.
 */
export const MAX_IMAGE_BYTES = 450_000;

const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

export type ParsedImage = { mime: string; bytes: Buffer };

/** The decoded image, or a short reason it was refused. */
export function parseImageDataUrl(value: unknown): { ok: boolean; image?: ParsedImage; error?: string } {
  if (typeof value !== 'string') return { ok: false, error: 'Photo is missing' };
  const m = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!m) return { ok: false, error: 'Only JPEG, PNG or WebP photos can be sent' };
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: 'This photo is too large. Try a smaller one.' };
  if (!SIGNATURES[m[1]](bytes)) return { ok: false, error: 'This file is not a real photo' };
  return { ok: true, image: { mime: m[1], bytes } };
}
