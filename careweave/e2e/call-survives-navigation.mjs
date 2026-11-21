import os from 'node:os';
import puppeteer from 'puppeteer-core';

const OUT = (process.env.E2E_OUT || os.tmpdir()) + '/';
const WEB = process.env.WEB || 'http://localhost:5173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const state = (p) => p.evaluate(() => document.querySelector('.vc')?.getAttribute('data-state'));
const playing = (p) => p.evaluate(async () => { const v = document.querySelector('.vc-remote'); if (!v) return 'no video'; const t0 = v.currentTime; await new Promise((r) => setTimeout(r, 1200)); return `${v.videoWidth}x${v.videoHeight} time ${t0.toFixed(1)}->${v.currentTime.toFixed(1)} ${v.currentTime > t0 ? 'advancing' : 'FROZEN'}`; });
const navTo = (p, label) => p.evaluate((label) => [...document.querySelectorAll('.sidebar nav button')].find((b) => b.textContent.includes(label))?.click(), label);

const dp = await browser.newPage();
await dp.setViewport({ width: 1440, height: 900 });
await dp.goto(WEB + '/login', { waitUntil: 'domcontentloaded' });
await dp.waitForSelector('input[type="email"]');
await dp.type('input[type="email"]', 'doctor@careweave.test');
await dp.type('input[type="password"]', 'demo123');
await dp.keyboard.press('Enter');
await dp.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 });
await wait(1500);
await navTo(dp, 'Video Consultation');
await wait(800);
await dp.evaluate(() => [...document.querySelectorAll('.vc-mode button')].find((b) => b.textContent.includes('Walk-in'))?.click());
await wait(300);
await dp.evaluate(() => { const el = document.querySelector('input[aria-label="Walk-in name"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'Away Back'); el.dispatchEvent(new Event('input', { bubbles: true })); });
await dp.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Start video consult'))?.click());
await dp.waitForSelector('input[aria-label="Patient link"]', { timeout: 10000 });
const link = await dp.$eval('input[aria-label="Patient link"]', (i) => i.value);

const pp = await (await browser.createBrowserContext()).newPage();
await pp.setViewport({ width: 390, height: 844 });
await pp.goto(link.replace(/^https?:\/\/[^/]+/, WEB), { waitUntil: 'domcontentloaded' });
await pp.waitForSelector('.vc-join');
await pp.evaluate(() => document.querySelector('.vc-join').click());
let ok = false;
for (let i = 0; i < 60; i++) { await wait(300); if ((await state(dp)) === 'connected' && (await state(pp)) === 'connected') { ok = true; break; } }
check('call connected', ok);

// The doctor leaves the video page for other pages of the portal
await dp.bringToFront();
await navTo(dp, 'Messages');
await wait(2500);
check('doctor is on the Messages page', await dp.evaluate(() => document.body.innerText.includes('Messaging') && !!document.querySelector('.mg')));
check('"Video consultation in progress" banner is shown', await dp.evaluate(() => document.querySelector('.call-banner')?.innerText.includes('Video consultation in progress') ?? false));
check('sidebar shows "In call"', await dp.evaluate(() => [...document.querySelectorAll('.sidebar nav button')].some((b) => b.textContent.includes('Video Consultation') && b.textContent.includes('In call'))));
await navTo(dp, 'Patient Records');
await wait(1500);
await navTo(dp, 'Labs');
await wait(4000);
check('patient call is STILL connected while the doctor is on other pages', (await state(pp)) === 'connected', `(patient=${await state(pp)})`);
const patSees = await (async () => { await pp.bringToFront(); return playing(pp); })();
check("patient still receives the doctor's video", /advancing/.test(patSees), `(${patSees})`);

// Back to the call through the banner
await dp.bringToFront();
await dp.evaluate(() => document.querySelector('.call-banner button')?.click());
await wait(1000);
check('Return to call shows the same call, still connected', (await state(dp)) === 'connected' && await dp.evaluate(() => !!document.querySelector('.vc-stage')));
const docSees = await playing(dp);
check("doctor still receives the patient's video after coming back", /advancing/.test(docSees), `(${docSees})`);
await dp.screenshot({ path: OUT + 'awayback-doctor.png' });

// The doctor opens ANOTHER BROWSER TAB for a while (the page goes to the background), then comes back
const other = await browser.newPage();
await other.goto('about:blank');
await other.bringToFront();
await wait(25000);
await dp.bringToFront();
await wait(1500);
check('after 25 s in another browser tab the doctor call is still connected', (await state(dp)) === 'connected', `(doctor=${await state(dp)}, patient=${await state(pp)})`);
check('video still advancing after the browser-tab trip', /advancing/.test(await playing(dp)));
check('the patient was not told the call ended', (await state(pp)) === 'connected');

// Ending still works and the banner goes
await dp.evaluate(() => [...document.querySelectorAll('.vc-bar button')].find((b) => b.textContent.trim() === 'End')?.click());
await wait(1500);
await navTo(dp, 'Messages');
await wait(800);
check('after End there is no in-progress banner', await dp.evaluate(() => !document.querySelector('.call-banner')));
check('patient is told the consultation ended', (await (async () => { await pp.bringToFront(); await wait(1500); return state(pp); })()) === 'ended');
await browser.close();
console.log(results.every(Boolean) ? 'RESULT: PASS' : 'RESULT: FAIL');
