import crypto from 'node:crypto';

/**
 * Creating and managing sign-in accounts in Firebase Authentication. Verifying a sign-in needs only the project id; creating an
 * account needs a service account key, so this is "not configured" until FIREBASE_SERVICE_ACCOUNT is set (the key's JSON, or that JSON in base64).
 */
export type FirebaseUsers = {
  configured: boolean;
  /** Creates the account, or reuses one that already exists for this email. */
  create(input: { email: string; name: string; password: string }): Promise<{ uid: string; existed: boolean }>;
  setDisabled(email: string, disabled: boolean): Promise<void>;
  setPassword(email: string, password: string): Promise<void>;
  resetLink(email: string): Promise<string>;
  remove(email: string): Promise<void>;
};

export const notConfigured: FirebaseUsers = {
  configured: false,
  create: async () => { throw new Error('Firebase account creation is not configured'); },
  setDisabled: async () => {},
  setPassword: async () => {},
  resetLink: async () => { throw new Error('Firebase account creation is not configured'); },
  remove: async () => {},
};

/** A readable one-time password: no look-alike characters, at least 14 of them. */
export const generatePassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(14), (b) => alphabet[b % alphabet.length]).join('');
};

function readKey(): any | null {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  try { return JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')); } catch { return null; }
}

export function firebaseUsersFromEnv(): FirebaseUsers {
  const key = readKey();
  if (!key) return notConfigured;
  // Loaded on first use, like sign-in verification, so the rest of the API starts where firebase-admin cannot load.
  const auth = async () => {
    const [{ cert, getApps, initializeApp }, { getAuth }] = await Promise.all([import('firebase-admin/app'), import('firebase-admin/auth')]);
    return getAuth(getApps()[0] ?? initializeApp({ credential: cert(key), projectId: key.project_id || process.env.FIREBASE_PROJECT_ID }));
  };
  const find = async (email: string) => (await auth()).getUserByEmail(email).catch((e: any) => (e?.code === 'auth/user-not-found' ? null : Promise.reject(e)));
  return {
    configured: true,
    async create({ email, name, password }) {
      const a = await auth();
      const existing = await find(email);
      if (existing) return { uid: existing.uid, existed: true };
      // emailVerified: the administrator vouches for this address, so the person can sign in without a separate verification step.
      const u = await a.createUser({ email, password, displayName: name, emailVerified: true });
      return { uid: u.uid, existed: false };
    },
    async setDisabled(email, disabled) { const u = await find(email); if (u) await (await auth()).updateUser(u.uid, { disabled }); },
    async setPassword(email, password) { const u = await find(email); if (u) await (await auth()).updateUser(u.uid, { password }); },
    resetLink: async (email) => (await auth()).generatePasswordResetLink(email),
    async remove(email) { const u = await find(email); if (u) await (await auth()).deleteUser(u.uid); },
  };
}
