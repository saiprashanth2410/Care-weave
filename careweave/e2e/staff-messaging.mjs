import os from 'node:os';
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const OUT = (process.env.E2E_OUT || os.tmpdir()) + '/';
const API = process.env.API || 'http://localhost:4000', WEB = process.env.WEB || 'http://localhost:5173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (m, path, token, body) => (await fetch(API + path, { method: m, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })).json().catch(() => ({}));
const login = async (w) => (await call('POST', '/api/auth/login', null, { email: `${w}@careweave.test`, password: 'demo123' })).token;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

const recT = await login('reception'), docT = await login('doctor');
const docId = (await call('GET', '/api/me', docT)).id, recId = (await call('GET', '/api/me', recT)).id;

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, args: ['--no-sandbox'] });
const loginUi = async (p, who) => {
  await p.goto(WEB + '/login', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('input[type="email"]');
  await p.type('input[type="email"]', `${who}@careweave.test`);
  await p.type('input[type="password"]', 'demo123');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 });
  await wait(1500);
};
const nav = (p, label) => p.evaluate((label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(label))?.click(), label);
const setText = (p, sel, text) => p.evaluate((sel, text) => { const el = document.querySelector(sel); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); }, sel, text);
const clickSel = (p, sel) => p.evaluate((sel) => { const el = document.querySelector(sel); el?.click(); return !!el; }, sel);
const body = (p) => p.evaluate(() => document.body.innerText);

const rp = await (await browser.createBrowserContext()).newPage();
await rp.setViewport({ width: 1440, height: 900 });
await loginUi(rp, 'reception');
const dp = await (await browser.createBrowserContext()).newPage();
await dp.setViewport({ width: 1440, height: 900 });
await loginUi(dp, 'doctor');

// 1. Receptionist writes to the doctor
await rp.bringToFront();
await nav(rp, 'Messages');
await wait(800);
await clickSel(rp, '.mg-compose-btn');
await wait(600);
check('receptionist picker lists the doctor', await clickSel(rp, `.mg-pick [data-person="${docId}"]`));
await wait(600);
await setText(rp, '.mg-compose textarea', 'Dr, Meena (token A-004) is here with sugar 280. Please see her next.');
await clickSel(rp, '.mg-send');
await wait(1200);
check('receptionist sees her own message', (await body(rp)).includes('Meena (token A-004)'));
await rp.screenshot({ path: OUT + 'msg-reception.png' });
await nav(rp, 'Overview'); // she goes back to work; the reply should show as unread
await wait(800);

// 2. Doctor gets the unread badge without reloading
await dp.bringToFront();
let badge = '';
for (let i = 0; i < 20; i++) { await wait(1000); badge = await dp.evaluate(() => [...document.querySelectorAll('.sidebar nav button')].find((b) => b.textContent.includes('Messages'))?.querySelector('.nav-count')?.textContent || ''); if (badge) break; }
check('doctor Messages menu shows an unread badge (no reload)', badge === '1', `(badge=${badge})`);
await nav(dp, 'Messages');
await wait(1000);
const listText = await dp.evaluate(() => document.querySelector('.mg-list')?.innerText || '');
check('conversation list shows the front-desk person, role and snippet', /Maya Patel/.test(listText) && /Front desk/i.test(listText) && /sugar 280/.test(listText));
await clickSel(dp, `.mg-item[data-person="${recId}"]`);
await wait(1200);
check('doctor opens the thread and reads the message', (await body(dp)).includes('Meena (token A-004)'));
await wait(1200);
badge = await dp.evaluate(() => [...document.querySelectorAll('.sidebar nav button')].find((b) => b.textContent.includes('Messages'))?.querySelector('.nav-count')?.textContent || '');
check('badge clears after reading', badge === '');

// 3. Doctor replies with a photo (a prescription picture) and text
const fileInput = await dp.$('.mg-compose input[type="file"]');
const PHOTO = OUT + 'e2e-photo.png';
// a real 1x1 PNG, so no picture has to be kept in the repository
writeFileSync(PHOTO, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
await fileInput.uploadFile(PHOTO);
await dp.waitForSelector('.mg-pending img', { timeout: 8000 });
check('photo preview appears before sending', true);
await setText(dp, '.mg-compose textarea', 'Noted. Also send me last report photo.');
await clickSel(dp, '.mg-send');
await wait(1500);
check('doctor sees the photo and text in the thread', await dp.evaluate(() => !!document.querySelector('.mg-msg.me .mg-photo img') && document.body.innerText.includes('last report photo')));
await dp.screenshot({ path: OUT + 'msg-doctor.png' });

// 4. Receptionist receives it: badge, photo loads (authenticated), and the doctor's message was Seen
await rp.bringToFront();
badge = '';
for (let i = 0; i < 20; i++) { await wait(1000); badge = await rp.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Messages'))?.querySelector('.nav-count')?.textContent || ''); if (badge) break; }
check('receptionist gets an unread badge', badge === '1', `(badge=${badge})`);
await nav(rp, 'Messages');
await wait(800);
const unreadBold = await rp.evaluate(() => !!document.querySelector('.mg-item.unread'));
check('the conversation is highlighted as unread in the list', unreadBold);
await clickSel(rp, `.mg-item[data-person="${docId}"]`);
await wait(1500);
const photoOk = await rp.evaluate(() => { const i = document.querySelector('.mg-msg.them .mg-photo img'); return !!i && i.complete && i.naturalWidth > 0; });
check('receptionist sees the photo rendered', photoOk);
check('receptionist sees "Seen" on her own message', (await body(rp)).includes('Seen'));
await clickSel(rp, '.mg-photo');
await wait(500);
check('clicking the photo opens the full-size viewer', await rp.evaluate(() => !!document.querySelector('.mg-viewer img')));
await rp.screenshot({ path: OUT + 'msg-reception2.png' });
await rp.evaluate(() => document.querySelector('.mg-viewer-close')?.click());

// 5. Mobile layout for the receptionist
await rp.setViewport({ width: 390, height: 844 });
await wait(600);
await rp.screenshot({ path: OUT + 'msg-mobile.png' });
await browser.close();
console.log(results.every(Boolean) ? 'RESULT: PASS' : 'RESULT: FAIL');
