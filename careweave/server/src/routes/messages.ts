import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { rateLimit } from '../middleware.js';
import { convIdOf } from '../repo/messages.js';
import { parseImageDataUrl } from '../services/imageData.js';
import { id, now } from '../util.js';
import type { Message, User } from '../repo/types.js';

const MAX_TEXT = 2000;
const STAFF_ROLES = ['receptionist', 'doctor', 'lab', 'admin'];

/**
 * Internal messaging between staff (receptionist, doctor, laboratory, administrator): one-to-one conversations with text and photos.
 * Only the two people in a conversation can read it; there is no administrator view of other people's messages.
 */
export function messageRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);
  const { roles, audit } = ctx;
  const R = () => ctx.repos;
  const staff = roles(...STAFF_ROLES);
  const sendLimit = rateLimit(() => ctx.repos, 'dm', 60_000, 40, (r) => r.user?.id || r.ip || '');

  const view = (u: User) => ({ id: u.id, name: u.name, role: u.role, facility: u.facility || '' });
  const people = async () => (await R().users.find({})).filter((u) => STAFF_ROLES.includes(u.role) && u.active !== false);
  const preview = (m: Message) => (m.text ? String(m.text).slice(0, 90) : m.imageId ? '📷 Photo' : '');

  router.get('/messages/contacts', staff, async (req, res) => {
    res.json((await people()).filter((u) => u.id !== req.user.id).map(view).sort((a, b) => a.name.localeCompare(b.name)));
  });

  router.get('/messages/unread', staff, async (req, res) => {
    res.json({ count: await R().messages.unreadFor(req.user.id) });
  });

  router.get('/messages/conversations', staff, async (req, res) => {
    const me = req.user.id;
    const [msgs, all] = await Promise.all([R().messages.involving(me), people()]);
    const byId = new Map(all.map((u) => [u.id, u]));
    const rows = new Map<string, { last: any; unread: number }>();
    for (const m of msgs) {
      const other = m.fromId === me ? m.toId : m.fromId;
      const row = rows.get(other) || { last: m, unread: 0 }; // newest first, so the first one seen is the last message
      if (m.toId === me && !m.read) row.unread += 1;
      rows.set(other, row);
    }
    res.json([...rows.entries()]
      .filter(([other]) => byId.has(other))
      .map(([other, r]) => ({ with: view(byId.get(other)!), unread: r.unread, last: { text: preview(r.last), at: r.last.at, mine: r.last.fromId === me } }))
      .sort((a, b) => b.last.at - a.last.at));
  });

  router.get('/messages/with/:userId', staff, async (req, res) => {
    const other = (await people()).find((u) => u.id === req.params.userId);
    if (!other || other.id === req.user.id) return res.status(404).json({ error: 'Person not found' });
    const rows = (await R().messages.thread(convIdOf(req.user.id, other.id))).reverse();
    // Opening the conversation reads what was waiting for you.
    for (const m of rows) if (m.toId === req.user.id && !m.read) await R().messages.update(m, { read: true, readAt: now() }).catch(() => {});
    res.json({
      with: view(other),
      messages: rows.map((m) => ({ id: m.id, mine: m.fromId === req.user.id, text: m.text || '', imageId: m.imageId || null, at: m.at, read: Boolean(m.read) }))
    });
  });

  router.post('/messages/with/:userId', staff, sendLimit, async (req, res) => {
    const other = (await people()).find((u) => u.id === req.params.userId);
    if (!other || other.id === req.user.id) return res.status(404).json({ error: 'Person not found' });
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (text.length > MAX_TEXT) return res.status(413).json({ error: `A message can be up to ${MAX_TEXT} characters` });
    let imageId: string | undefined;
    if (req.body?.image !== undefined && req.body?.image !== null) {
      const parsed = parseImageDataUrl(req.body.image);
      if (!parsed.ok || !parsed.image) return res.status(400).json({ error: parsed.error });
      imageId = id('img');
      await R().messageImages.insert({ id: imageId, mime: parsed.image.mime, data: parsed.image.bytes.toString('base64'), ownerIds: [req.user.id, other.id], createdAt: now() });
    }
    if (!text && !imageId) return res.status(400).json({ error: 'Write a message or attach a photo' });
    const m: Message = {
      id: id('msg'), convId: convIdOf(req.user.id, other.id), fromId: req.user.id, toId: other.id, text, imageId, at: Date.now(), read: false
    };
    await R().messages.insert(m);
    await audit(req, 'create', 'message', m.id, `Message to ${other.role}${imageId ? ' (with photo)' : ''}`); // who wrote to whom, never the content
    res.status(201).json({ id: m.id, mine: true, text, imageId: imageId || null, at: m.at, read: false });
  });

  // A photo can be opened only by the two people in the conversation it was sent in.
  router.get('/messages/image/:imageId', staff, async (req, res) => {
    const img = await R().messageImages.byId(String(req.params.imageId));
    if (!img || !(img.ownerIds || []).includes(req.user.id)) return res.status(404).json({ error: 'Photo not found' });
    res.set({ 'Content-Type': img.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    res.send(Buffer.from(img.data, 'base64'));
  });

  return router;
}
