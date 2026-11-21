import os from 'node:os';
import puppeteer from 'puppeteer-core';

const OUT = (process.env.E2E_OUT || os.tmpdir()) + '/';
const API = process.env.API || 'http://localhost:4000', WEB = process.env.WEB || 'http://localhost:5173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (m, path, token, body) => (await fetch(API + path, { method: m, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })).json().catch(() => ({}));
const login = async (w) => (await call('POST', '/api/auth/login', null, { email: `${w}@careweave.test`, password: 'demo123' })).token;
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

const rec = await login('reception'), doc = await login('doctor');
const me = await call('GET', '/api/me', doc);
const tag = String.fromCharCode(65 + (Date.now() % 26)) + String.fromCharCode(65 + (Math.floor(Date.now() / 26) % 26));
const pt = await call('POST', '/api/patients', rec, { name: 'Desk Demo ' + tag, dob: '1993-06-06', gender: 'F', phone: '+91 90000 88888', address: 'Chennai' });
await call('POST', '/api/appointments', rec, { patientId: pt.id, doctorId: me.id, date: new Date().toISOString().slice(0, 10), time: `0${1 + (Date.now() % 8)}:${['00', '15', '30', '45'][Date.now() % 4]} PM`, reason: 'Video' });

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const loginUi = async (p, who) => {
  await p.goto(WEB + '/login', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('input[type="email"]');
  await p.type('input[type="email"]', `${who}@careweave.test`);
  await p.type('input[type="password"]', 'demo123');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 });
  await wait(1500);
};

// Receptionist in her own browser context, on the Doctor Roster
const rctx = await browser.createBrowserContext();
const rp = await rctx.newPage();
await rp.setViewport({ width: 1440, height: 900 });
await loginUi(rp, 'reception');
await rp.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Doctor Roster'))?.click());
await wait(1500);
const roster = () => rp.evaluate(() => document.body.innerText.toLowerCase());
check('before: roster does not mention a video consultation', !(await roster()).includes('video consultation with'));

// Doctor starts a consult
const dp = await browser.newPage();
await dp.setViewport({ width: 1440, height: 900 });
await loginUi(dp, 'doctor');
await dp.evaluate(() => [...document.querySelectorAll('.sidebar nav button')].find((b) => b.textContent.includes('Video Consultation'))?.click());
await wait(1000);
await dp.select('select[aria-label="Patient"]', pt.id);
await dp.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Start video consult'))?.click());
await dp.waitForSelector('.vc', { timeout: 10000 });

// The receptionist's screen updates on its own (live refresh), without reloading
await rp.bringToFront();
let seen = false;
for (let i = 0; i < 25; i++) { await wait(1000); const t = await roster(); if (t.includes('in video consultation') && t.includes('desk demo ' + tag.toLowerCase())) { seen = true; break; } }
check('receptionist roster shows "In Video Consultation" with the patient name (no reload)', seen);
await rp.screenshot({ path: OUT + 'reception-video.png' });
await rp.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('On video'))?.click());
await wait(500);
check('the "On video" filter lists the doctor', (await roster()).includes('video consultation with'));

// Doctor ends: badge disappears
await dp.bringToFront();
await dp.evaluate(() => [...document.querySelectorAll('.vc-bar button')].find((b) => b.textContent.trim() === 'End')?.click());
await wait(800);
await rp.bringToFront();
let gone = false;
for (let i = 0; i < 25; i++) { await wait(1000); if (!(await roster()).includes('video consultation with')) { gone = true; break; } }
check('after the doctor ends the call the badge goes away', gone);
await browser.close();
console.log(results.every(Boolean) ? 'RESULT: PASS' : 'RESULT: FAIL');
