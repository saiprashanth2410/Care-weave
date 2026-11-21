import os from 'node:os';
import puppeteer from 'puppeteer-core';

const OUT = (process.env.E2E_OUT || os.tmpdir()) + '/';
const WEB = process.env.WEB || 'http://localhost:5173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const state = (p) => p.evaluate(() => document.querySelector('.vc')?.getAttribute('data-state'));

const dp = await browser.newPage();
await dp.setViewport({ width: 1440, height: 900 });
await dp.goto(WEB + '/login', { waitUntil: 'domcontentloaded' });
await dp.waitForSelector('input[type="email"]');
await dp.type('input[type="email"]', 'doctor@careweave.test');
await dp.type('input[type="password"]', 'demo123');
await dp.keyboard.press('Enter');
await dp.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 });
await wait(1500);
await dp.evaluate(() => [...document.querySelectorAll('.sidebar nav button')].find((b) => b.textContent.includes('Video Consultation'))?.click());
await wait(800);
await dp.evaluate(() => [...document.querySelectorAll('.vc-mode button')].find((b) => b.textContent.includes('Walk-in'))?.click());
await wait(300);
await dp.evaluate(() => { const el = document.querySelector('input[aria-label="Walk-in name"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'Layout Check'); el.dispatchEvent(new Event('input', { bubbles: true })); });
await dp.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Start video consult'))?.click());
await dp.waitForSelector('input[aria-label="Patient link"]', { timeout: 10000 });
const link = (await dp.$eval('input[aria-label="Patient link"]', (i) => i.value)).replace(/^https?:\/\/[^/]+/, WEB);

const join = async (width, height) => {
  const p = await (await browser.createBrowserContext()).newPage();
  await p.setViewport({ width, height });
  await p.goto(link, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.vc-join');
  await p.evaluate(() => document.querySelector('.vc-join').click());
  for (let i = 0; i < 60; i++) { await wait(300); if ((await state(p)) === 'connected') break; }
  await wait(800);
  return p;
};
const rect = (p, sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }, sel);

// Laptop patient
const lp = await join(1440, 900);
await lp.bringToFront();
const stage = await rect(lp, '.vc-stage'), sheet = await rect(lp, '.vc-sheet');
check('laptop: chat panel is open at the right of the video, not over it', !!sheet && !!stage && sheet.x >= stage.x + stage.w - 2 && Math.abs(sheet.y - stage.y) < 4, `(video ${JSON.stringify(stage)}, chat ${JSON.stringify(sheet)})`);
check('laptop: the video is still wide (not squeezed)', stage.w > 700, `(${stage.w}px)`);
await lp.screenshot({ path: OUT + 'layout-laptop-open.png' });
await lp.evaluate(() => [...document.querySelectorAll('.vc-sheet-head button')][0]?.click());
await wait(500);
check('laptop: closing the chat gives the video the full width', (await rect(lp, '.vc-stage')).w > stage.w + 250 && !(await rect(lp, '.vc-sheet')));
await lp.screenshot({ path: OUT + 'layout-laptop-closed.png' });
await lp.evaluate(() => [...document.querySelectorAll('.vc-bar button')].find((b) => b.textContent.startsWith('Chat'))?.click());
await wait(400);
check('laptop: the Chat button brings the panel back', !!(await rect(lp, '.vc-sheet')));

// Phone patient
const mp = await join(390, 844);
await mp.bringToFront();
check('phone: chat starts closed so the video is full screen', !(await rect(mp, '.vc-sheet')));
await mp.evaluate(() => [...document.querySelectorAll('.vc-bar button')].find((b) => b.textContent.startsWith('Chat'))?.click());
await wait(500);
const sh = await rect(mp, '.vc-sheet');
check('phone: chat opens as a bottom sheet over the video', !!sh && sh.w >= 385 && sh.y > 250, `(${JSON.stringify(sh)})`);
await mp.screenshot({ path: OUT + 'layout-phone-sheet.png' });

// Doctor panel unchanged
await dp.bringToFront();
const dstage = await rect(dp, '.vc-stage');
check('doctor portal: once connected the video takes the room, up to 1000 px', dstage.w > 700 && dstage.w <= 1000, `(${dstage.w}px)`);
await browser.close();
console.log(results.every(Boolean) ? 'RESULT: PASS' : 'RESULT: FAIL');
