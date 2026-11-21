import os from 'node:os';
import puppeteer from 'puppeteer-core';

const API = process.env.API || 'http://localhost:4000', WEB = process.env.WEB || 'http://localhost:5173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false,
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
});
const setText = (p, sel, text) => p.evaluate((sel, text) => { const el = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); }, sel, text);

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
const startBtn = () => dp.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Start video consult'))?.disabled);
check('Start is disabled until a name is typed', (await startBtn()) === true);
await setText(dp, 'input[aria-label="Walk-in name"]', 'Ravi Walkin');
check('Start enables after a name', (await startBtn()) === false);
await dp.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Start video consult'))?.click());
await dp.waitForSelector('input[aria-label="Patient link"]', { timeout: 10000 });
const link = await dp.$eval('input[aria-label="Patient link"]', (i) => i.value);
check('walk-in consult starts and shows the link', /\/consult\/.{20,}/.test(link));
check('heading names the walk-in', (await dp.evaluate(() => document.body.innerText)).includes('Consultation with Ravi Walkin'));

const ctx = await browser.createBrowserContext();
const pp = await ctx.newPage();
await pp.setViewport({ width: 390, height: 844 });
await pp.goto(link.replace(/^https?:\/\/[^/]+/, WEB), { waitUntil: 'domcontentloaded' });
await pp.waitForSelector('.vc-join');
check('walk-in sees only their first name', (await pp.evaluate(() => document.body.innerText)).includes('Hello Ravi,'));
const t0 = Date.now();
await pp.evaluate(() => document.querySelector('.vc-join').click());
let ms = -1;
for (let i = 0; i < 120; i++) {
  await wait(250);
  const s = await Promise.all([dp, pp].map((p) => p.evaluate(() => document.querySelector('.vc')?.getAttribute('data-state'))));
  if (s[0] === 'connected' && s[1] === 'connected') { ms = Date.now() - t0; break; }
}
check('call connects', ms > 0, `(joined -> both connected in ${ms} ms)`);
await browser.close();
console.log(results.every(Boolean) ? 'RESULT: PASS' : 'RESULT: FAIL');
