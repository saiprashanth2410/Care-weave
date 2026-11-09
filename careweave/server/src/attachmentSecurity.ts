import crypto from 'node:crypto';
import net from 'node:net';

// Protection for stored report files: a malware scan before a file is accepted, and encryption of the bytes before they are stored.

// ── scan ─────────────────────────────────────────────────────────────────────
// Standard antivirus test string (harmless): every scanner treats it as a virus, so it proves a scan happens without real malware.
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export class ScannerUnavailable extends Error {}

/**
 * Looks for malware before a file is stored. With CLAMAV_HOST (and optionally CLAMAV_PORT, default 3310) set, the file is streamed to a
 * ClamAV daemon; if the daemon cannot be reached the upload is refused (fail closed), because a scanner you configured but cannot
 * reach is not a scan. Without it only the built-in test-signature check runs, and nothing else is claimed.
 */
export async function scanFile(buf: Buffer): Promise<{ clean: boolean; signature?: string }> {
  if (buf.includes(EICAR)) return { clean: false, signature: 'EICAR-Test-File' };
  const host = process.env.CLAMAV_HOST;
  if (!host) return { clean: true };
  return clamdScan(buf, host, Number(process.env.CLAMAV_PORT) || 3310);
}
export const scannerConfigured = () => !!process.env.CLAMAV_HOST;

function clamdScan(buf: Buffer, host: string, port: number): Promise<{ clean: boolean; signature?: string }> {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port });
    let out = '';
    const fail = (why: string) => { sock.destroy(); reject(new ScannerUnavailable(why)); };
    sock.setTimeout(15_000, () => fail('the virus scanner timed out'));
    sock.on('error', (e) => fail(`the virus scanner is unreachable: ${e.message}`));
    sock.on('data', (d) => { out += d.toString(); });
    sock.on('end', () => {
      const reply = out.replace(/\0/g, '').trim();
      if (/OK$/.test(reply)) return resolve({ clean: true });
      const found = reply.match(/stream:\s*(.+?)\s+FOUND$/);
      if (found) return resolve({ clean: false, signature: found[1] });
      reject(new ScannerUnavailable(`the virus scanner gave an unexpected reply: ${reply.slice(0, 80)}`));
    });
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      for (let i = 0; i < buf.length; i += 64 * 1024) {
        const chunk = buf.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        sock.write(len);
        sock.write(chunk);
      }
      sock.write(Buffer.alloc(4)); // zero-length chunk ends the stream
    });
  });
}

// ── encryption ───────────────────────────────────────────────────────────────
// AES-256-GCM with a random IV per file. ATTACHMENT_KEY is 32 bytes as 64 hex characters or base64. Stored bytes are
// 'CWE1' + iv (12) + auth tag (16) + ciphertext, so a file written before encryption was switched on (no prefix) is still readable.
const MAGIC = Buffer.from('CWE1');

export function attachmentKey(): Buffer | null {
  const raw = process.env.ATTACHMENT_KEY?.trim();
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('ATTACHMENT_KEY must be 32 bytes: 64 hex characters or base64');
  return key;
}

export function seal(data: Buffer, key = attachmentKey()): Buffer {
  if (!key) return data;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function open(stored: Buffer, key = attachmentKey()): Buffer {
  if (stored.length < 32 || !stored.subarray(0, 4).equals(MAGIC)) return stored; // saved before encryption was on
  if (!key) throw new Error('This file is encrypted and ATTACHMENT_KEY is not set');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, stored.subarray(4, 16));
  decipher.setAuthTag(stored.subarray(16, 32));
  return Buffer.concat([decipher.update(stored.subarray(32)), decipher.final()]);
}
