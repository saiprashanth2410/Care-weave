import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { expectedVersion } from '../middleware.js';
import { DuplicateError } from '../repo/index.js';
import { DEFAULT_PERMISSIONS, PERMISSIONS, ROLES, isRole, type StaffRole } from '../services/staffCatalog.js';
import { generatePassword } from '../services/firebaseUsers.js';
import { id, now, text } from '../util.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What an administrator may see of an account. Never the password hash. */
const view = (u: any) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, facility: u.facility || '', permissions: u.permissions || [],
  active: u.active !== false, localLogin: !!u.passwordHash, firebaseLinked: !!u.firebaseUid, version: u.version,
});

/** Keep only permissions this role may hold. Returns null if the list is not an array of strings. */
const cleanPermissions = (role: StaffRole, value: unknown) =>
  Array.isArray(value) && value.every((p) => typeof p === 'string') ? [...new Set(value as string[])].filter((p) => PERMISSIONS[role].includes(p)) : null;

/** Staff accounts, roles and permissions. Administrators only; an administrator never reads patient records. */
export function staffRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);
  const { roles, audit } = ctx;
  const admin = roles('admin');

  router.get('/staff/catalog', admin, (_req, res) => res.json({ roles: ROLES, permissions: PERMISSIONS, defaults: DEFAULT_PERMISSIONS, firebase: ctx.firebaseUsers.configured }));

  router.get('/staff', admin, async (_req, res) => {
    const all = await ctx.repos.users.find({}, { sort: { name: 1 } });
    res.json(all.map(view));
  });

  router.post('/staff', admin, async (req: any, res) => {
    const b = req.body || {};
    const name = text(b.name, 80);
    const email = text(b.email, 120).toLowerCase();
    if (name.length < 2) return res.status(400).json({ error: 'Enter the staff member\'s name' });
    if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (!isRole(b.role)) return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}` });
    const permissions = b.permissions === undefined ? DEFAULT_PERMISSIONS[b.role] : cleanPermissions(b.role, b.permissions);
    if (!permissions) return res.status(400).json({ error: 'Permissions must be a list' });
    const password = typeof b.password === 'string' ? b.password : '';
    if (password && password.length < 8) return res.status(400).json({ error: 'A password needs at least 8 characters' });
    if (await ctx.repos.users.byEmail(email)) return res.status(409).json({ error: 'A staff account with this email already exists' });

    // With a Firebase service account configured, the sign-in account is created there too. The password is shown to the
    // administrator once and is never stored or logged; the person is asked to change it after signing in.
    const fb = ctx.firebaseUsers;
    let firebase: 'created' | 'existing' | 'not-configured' = 'not-configured';
    let temporaryPassword: string | undefined;
    if (fb.configured) {
      const firebasePassword = password || generatePassword();
      try {
        const made = await fb.create({ email, name, password: firebasePassword });
        firebase = made.existed ? 'existing' : 'created';
        if (!made.existed && !password) temporaryPassword = firebasePassword;
      } catch (err: any) {
        console.error('Firebase account creation failed:', err?.code || err?.message);
        return res.status(502).json({ error: 'Could not create the Firebase sign-in account. Nothing was saved. Check the server\'s Firebase credentials.' });
      }
    }

    const u = {
      id: id('u'), name, email, role: b.role, facility: text(b.facility, 120), permissions, active: true, managed: true,
      ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}), createdAt: now(),
    };
    try { await ctx.repos.users.insert(u); } catch (err) {
      if (firebase === 'created') await fb.remove(email).catch(() => {}); // do not leave a sign-in with no staff record
      if (err instanceof DuplicateError) return res.status(409).json({ error: 'A staff account with this email already exists' });
      throw err;
    }
    await audit(req, 'create', 'staff', u.id, `${u.role} account for ${u.email} (Firebase: ${firebase}${password ? '; local password set' : ''})`);
    res.status(201).json({ ...view(u), firebase, ...(temporaryPassword ? { temporaryPassword } : {}) });
  });

  router.patch('/staff/:id', admin, async (req: any, res) => {
    const u = await ctx.repos.users.byId(String(req.params.id));
    if (!u) return res.status(404).json({ error: 'Staff account not found' });
    const b = req.body || {};
    const self = u.id === req.user.id;
    const changes: Record<string, any> = {};
    const said: string[] = [];

    if (b.name !== undefined) {
      const name = text(b.name, 80);
      if (name.length < 2) return res.status(400).json({ error: 'Enter the staff member\'s name' });
      changes.name = name;
    }
    if (b.facility !== undefined) changes.facility = text(b.facility, 120);

    const roleChange = b.role !== undefined && b.role !== u.role;
    if (roleChange || b.permissions !== undefined || b.active !== undefined) {
      // Locking yourself out, or stripping your own access, would leave nobody able to repair the directory.
      if (self) return res.status(400).json({ error: 'You cannot change your own role, permissions or status. Ask another administrator.' });
    }
    const role: StaffRole = roleChange ? (isRole(b.role) ? b.role : (null as any)) : u.role;
    if (!role) return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}` });
    if (roleChange) { changes.role = role; said.push(`role ${u.role} → ${role}`); }
    if (b.permissions !== undefined || roleChange) {
      const perms = b.permissions !== undefined ? cleanPermissions(role, b.permissions) : DEFAULT_PERMISSIONS[role];
      if (!perms) return res.status(400).json({ error: 'Permissions must be a list' });
      changes.permissions = perms;
      changes.managed = true; // the start-up seed no longer overwrites what an administrator set
      said.push(`permissions: ${perms.join(', ') || 'none'}`);
    }
    if (b.active !== undefined) {
      if (typeof b.active !== 'boolean') return res.status(400).json({ error: 'active must be true or false' });
      changes.active = b.active;
      said.push(b.active ? 'enabled' : 'disabled');
    }
    if (b.password !== undefined) {
      const password = String(b.password);
      if (password.length < 8) return res.status(400).json({ error: 'A password needs at least 8 characters' });
      changes.passwordHash = await bcrypt.hash(password, 10);
      said.push('password reset');
    }
    if (!Object.keys(changes).length) return res.status(400).json({ error: 'Nothing to change' });

    if (changes.passwordHash !== undefined && ctx.firebaseUsers.configured) {
      try { await ctx.firebaseUsers.setPassword(u.email, String(b.password)); } catch {
        return res.status(502).json({ error: 'Could not change the Firebase password. Nothing was saved.' });
      }
    }
    const saved = await ctx.repos.users.update(u, changes, expectedVersion(req, u));
    // Firebase is told too, but the staff record is what the server checks on every request, so a failure here does not leave access open.
    if (changes.active !== undefined) await ctx.firebaseUsers.setDisabled(u.email, !changes.active).catch((e: any) => console.error('Firebase disable failed:', e?.code || e?.message));
    // A disabled account must stop working at once, not when its session happens to expire.
    if (changes.active === false) await ctx.repos.sessions.removeForUser(u.id);
    await audit(req, 'update', 'staff', u.id, `${u.email}: ${said.join('; ') || 'details updated'}`);
    res.json(view(saved));
  });

  // A link the person opens to choose their own password. Better than passing a password around.
  router.post('/staff/:id/reset-link', admin, async (req: any, res) => {
    const u = await ctx.repos.users.byId(String(req.params.id));
    if (!u) return res.status(404).json({ error: 'Staff account not found' });
    if (!ctx.firebaseUsers.configured) return res.status(400).json({ error: 'Reset links need Firebase account management to be configured' });
    let link: string;
    try { link = await ctx.firebaseUsers.resetLink(u.email); } catch {
      return res.status(502).json({ error: 'Could not create a reset link for this account in Firebase' });
    }
    await audit(req, 'update', 'staff', u.id, `${u.email}: password reset link generated`);
    res.json({ link });
  });

  return router;
}
