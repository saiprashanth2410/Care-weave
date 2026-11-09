import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { AppCtx } from '../context.js';
import { ConflictError } from '../repo/index.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { BROWSER_HEADER, clearedCookie, endSession, sessionCookie, startSession } from '../services/sessions.js';

// ── Sign-in ────────────────────────────────────────────────────────────────
// With FIREBASE_PROJECT_ID set, staff sign in with Firebase Authentication (email and password) and the server
// verifies the Firebase ID token itself. Roles and permissions always come from the staff directory kept here,
// never from anything the browser sends.
export function authRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);

  const FIREBASE_PROJECT_ID = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const firebaseOn = !!FIREBASE_PROJECT_ID;
  const firebaseAuth = firebaseOn ? getAuth(getApps()[0] ?? initializeApp({ projectId: FIREBASE_PROJECT_ID })) : null;
  // Email and password sign-in with a local password is for development. It is off once Firebase is configured.
  // In production it is also off unless ALLOW_LOCAL_LOGIN=true is set on purpose.
  const localLoginAllowed = process.env.ALLOW_LOCAL_LOGIN === 'true' || (!firebaseOn && !ctx.config.isProd);
  // A Firebase account can be created by anyone unless sign-up is switched off in the console, so an unverified
  // email is not proof of who someone is. Turn this off only after disabling sign-up in Firebase.
  const requireVerifiedEmail = process.env.FIREBASE_REQUIRE_VERIFIED_EMAIL !== 'false';

  const secure = (req: any) => ctx.config.isProd || req.secure || req.get('x-forwarded-proto') === 'https';

  async function signIn(u: any, how: string, req: any, res: any) {
    const token = await startSession(ctx.repos, u.id);
    await ctx.audit({ user: u }, 'login', how, u.id, `Successful ${u.role} sign-in`);
    // The browser app asks for a cookie and never receives the token in the response body. Other clients still get the token.
    const browser = req.get(BROWSER_HEADER) === 'cookie';
    if (browser) res.setHeader('Set-Cookie', sessionCookie(token, secure(req)));
    res.json({ ...(browser ? {} : { token }), user: { id: u.id, name: u.name, email: u.email, role: u.role, facility: u.facility, permissions: u.permissions || [] } });
  }

  router.get('/auth/config', (_req, res) => res.json({ firebase: firebaseOn, localLogin: localLoginAllowed }));

  router.post('/auth/login', ctx.limits.login, async (req, res) => {
    if (!localLoginAllowed) return res.status(403).json({ error: 'Sign in with your staff account' });
    const { email, password } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const u = await ctx.repos.users.byEmail(cleanEmail);
    // Always run a bcrypt compare so an unknown email and a wrong password look and time the same.
    const hash = u?.passwordHash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
    const ok = await bcrypt.compare(String(password || ''), hash).catch(() => false);
    if (!u || !u.passwordHash || !ok) return res.status(401).json({ error: 'Invalid email or password' });
    await signIn(u, 'session', req, res);
  });

  if (firebaseAuth) {
    router.post('/auth/firebase-login', ctx.limits.login, async (req, res) => {
      const idToken = String(req.body?.idToken || '');
      if (!idToken) return res.status(400).json({ error: 'A Firebase ID token is required' });
      let decoded: any;
      try {
        // verifyIdToken checks the signature, issuer, audience and expiry. A token that fails is never trusted.
        decoded = await firebaseAuth.verifyIdToken(idToken);
      } catch {
        return res.status(401).json({ error: 'Your sign-in could not be verified. Sign in again.' });
      }
      const uid = String(decoded.uid || '');
      const email = String(decoded.email || '').trim().toLowerCase();
      if (!uid || !email) return res.status(401).json({ error: 'Your sign-in could not be verified. Sign in again.' });

      // Only people already in the staff directory can sign in. Roles and permissions come from there, never from the token.
      let u = await ctx.repos.users.byEmail(email);
      if (!u) return res.status(403).json({ error: 'This account is not registered as CareWeave staff. Ask an administrator.' });
      if (u.firebaseUid && u.firebaseUid !== uid) return res.status(403).json({ error: 'This email is linked to a different sign-in account.' });
      if (!u.firebaseUid) {
        if (requireVerifiedEmail && decoded.email_verified !== true) {
          return res.status(403).json({ error: 'Verify your email address first, then sign in again.' });
        }
        try {
          u = await ctx.repos.users.update(u, { firebaseUid: uid });
        } catch (err) {
          if (!(err instanceof ConflictError)) throw err;
          // The account changed between reading and writing (a concurrent first sign-in): look again and apply the same rule.
          u = await ctx.repos.users.byEmail(email);
          if (!u || (u.firebaseUid && u.firebaseUid !== uid)) return res.status(403).json({ error: 'This email is linked to a different sign-in account.' });
        }
      }
      await signIn(u, 'firebase_auth', req, res);
    });
  } else {
    router.post('/auth/firebase-login', (_req, res) => res.status(404).json({ error: 'Not found' }));
  }

  return router;
}

/** Routes behind the staff sign-in. */
export function sessionRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);

  router.post('/auth/logout', async (req, res) => {
    await endSession(ctx.repos, req);
    res.setHeader('Set-Cookie', clearedCookie(ctx.config.isProd || req.secure || req.get('x-forwarded-proto') === 'https'));
    res.json({ ok: true });
  });

  router.get('/me', (req: any, res) =>
    res.json({
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      facility: req.user.facility,
      permissions: req.user.permissions || []
    })
  );
  return router;
}
