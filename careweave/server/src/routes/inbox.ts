import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { rateLimit } from '../middleware.js';
import { id, now, text } from '../util.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUSES = ['new', 'read', 'resolved'] as const;

/**
 * Messages from staff to the administrator: someone who cannot sign in (sent from the sign-in page, so no session), and signed-in
 * staff reporting a problem. The administrator reads them in the Inbox of the admin portal.
 */

/** Before sign-in. Always answers the same way, so it cannot be used to find out which addresses are staff. */
export function supportPublicRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);
  // One address cannot flood the inbox, and the whole endpoint has a ceiling too, because no one is signed in here.
  const perAddress = rateLimit(() => ctx.repos, 'support-email', 30 * 60 * 1000, 3, (r) => String(r.body?.email || '').trim().toLowerCase());
  const overall = rateLimit(() => ctx.repos, 'support-all', 60 * 60 * 1000, 120, () => 'all');

  router.post('/support/request', overall, perAddress, async (req: any, res) => {
    const email = text(req.body?.email, 120).toLowerCase();
    const message = text(req.body?.message, 1000);
    if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });

    const staff = await ctx.repos.users.byEmail(email);
    // A person who asks again while the first request is still open is counted on it, not given a second message.
    const open = (await ctx.repos.inbox.find({ kind: 'help', fromEmail: email, status: { $in: ['new', 'read'] } }, { limit: 1 }))[0];
    if (open) {
      await ctx.repos.inbox.update(open, { count: (open.count || 1) + 1, lastAt: now(), ...(message ? { message } : {}), status: 'new' });
    } else {
      await ctx.repos.inbox.insert({
        id: id('msg'), kind: 'help', fromEmail: email, fromName: staff?.name || '', fromRole: staff?.role || '',
        knownStaff: !!staff && staff.active !== false, subject: 'Needs help signing in', message,
        status: 'new', count: 1, createdAt: now(), lastAt: now(),
      });
    }
    res.status(202).json({ ok: true });
  });

  return router;
}

/** Behind sign-in: reporting a problem (any role), and the administrator's Inbox. */
export function inboxRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);
  const { roles, audit, auditOnce } = ctx;
  const admin = roles('admin');
  const perUser = rateLimit(() => ctx.repos, 'support-issue', 60 * 60 * 1000, 10, (r) => String(r.user?.id || r.ip));

  router.post('/support/issue', perUser, async (req: any, res) => {
    const subject = text(req.body?.subject, 120);
    const message = text(req.body?.message, 2000);
    if (message.length < 5) return res.status(400).json({ error: 'Describe the problem in a few words' });
    const m = await ctx.repos.inbox.insert({
      id: id('msg'), kind: 'issue', fromUserId: req.user.id, fromEmail: req.user.email, fromName: req.user.name, fromRole: req.user.role,
      knownStaff: true, subject: subject || 'Problem report', message, page: text(req.body?.page, 200),
      status: 'new', count: 1, createdAt: now(), lastAt: now(),
    });
    res.status(201).json({ id: m.id });
  });

  const withStaff = async (items: any[]) => {
    const emails = [...new Set(items.map((m) => m.fromEmail).filter(Boolean))];
    const staff = emails.length ? await ctx.repos.users.find({ email: { $in: emails } }) : [];
    const byEmail = new Map(staff.map((u: any) => [u.email, u]));
    return items.map((m) => {
      const u: any = byEmail.get(m.fromEmail);
      return { ...m, staffId: u?.id || '', staffActive: u ? u.active !== false : false };
    });
  };

  router.get('/inbox', admin, async (req: any, res) => {
    const status = String(req.query.status || 'all');
    const filter = status === 'all' ? {} : status === 'open' ? { status: { $in: ['new', 'read'] } } : STATUSES.includes(status as any) ? { status } : {};
    const [items, nNew, nRead, nResolved] = await Promise.all([
      ctx.repos.inbox.newestFirst(filter, 100),
      ctx.repos.inbox.count({ status: 'new' }), ctx.repos.inbox.count({ status: 'read' }), ctx.repos.inbox.count({ status: 'resolved' }),
    ]);
    await auditOnce(req, 'read', 'inbox', 'directory', 'Opened the inbox');
    res.json({ items: await withStaff(items), counts: { new: nNew, read: nRead, resolved: nResolved } });
  });

  // Small and cheap: the portal asks for this for the badge on the Inbox.
  router.get('/inbox/summary', admin, async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ new: await ctx.repos.inbox.count({ status: 'new' }) });
  });

  router.patch('/inbox/:id', admin, async (req: any, res) => {
    const m = await ctx.repos.inbox.byId(String(req.params.id));
    if (!m) return res.status(404).json({ error: 'Message not found' });
    const b = req.body || {};
    const changes: Record<string, any> = {};
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'Status must be new, read or resolved' });
      if (b.status !== m.status) {
        changes.status = b.status;
        if (b.status === 'read' && !m.readAt) changes.readAt = now();
        if (b.status === 'resolved') Object.assign(changes, { resolvedAt: now(), resolvedBy: req.user.name });
        if (b.status === 'new') Object.assign(changes, { resolvedAt: undefined, resolvedBy: undefined });
      }
    }
    if (b.note !== undefined) changes.note = text(b.note, 500);
    if (!Object.keys(changes).length) return res.json((await withStaff([m]))[0]);
    const saved = await ctx.repos.inbox.update(m, changes);
    // Reading a message is not worth an audit line; resolving or annotating one is.
    if (changes.status !== 'read') await audit(req, 'update', 'inbox', m.id, `${m.subject} from ${m.fromEmail}: ${changes.status ? `marked ${changes.status}` : 'note added'}`);
    res.json((await withStaff([saved]))[0]);
  });

  return router;
}
