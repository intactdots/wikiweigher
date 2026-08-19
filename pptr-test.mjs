import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
import puppeteer from 'puppeteer';

const EXT = process.env.EXT || ROOT;
const ART = process.argv[2] || 'https://en.wikipedia.org/wiki/Mount_Everest';
const SHOT = ROOT + '/.artifacts/card.png';

const browser = await puppeteer.launch({
  headless: false,
  protocolTimeout: 240000,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check', '--window-size=1500,1300']
});

const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1250 });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push('[pageerror] ' + (e.stack || e.message)));

await page.goto(ART, { waitUntil: 'domcontentloaded', timeout: 40000 });
await new Promise(r => setTimeout(r, 22000));

const state = await page.evaluate(() => {
  const h = document.getElementById('wikiweigher-host');
  const sr = h && h.shadowRoot;
  return {
    host: !!h,
    shadowLen: sr ? sr.innerHTML.length : 0,
    rows: sr ? sr.querySelectorAll('.cx-row').length : 0,
    badges: sr ? sr.querySelectorAll('.cx-badge').length : 0,
    best: sr ? ((sr.querySelector('.cx-best-name') && sr.querySelector('.cx-best-name').textContent) || (sr.querySelector('.cx-stay-row span') && sr.querySelector('.cx-stay-row span').textContent) || '') : '',
    status: document.documentElement.dataset.wikiweigherStatus || '(empty)'
  };
});

try { const el = await page.$('#wikiweigher-host'); if (el) await el.screenshot({ path: SHOT }); } catch {}

console.log('host:', state.host, '| shadowLen:', state.shadowLen, '| rows:', state.rows, '| badges:', state.badges, '| best:', state.best);
console.log('status:', state.status);
const bad = logs.filter(l => /crash|loader import failed|refused|content security/i.test(l));
if (bad.length) console.log('PROBLEMS:\n' + bad.join('\n'));

await browser.close();

const ok = state.host && state.shadowLen > 1000 && state.rows >= 3 && state.status === 'ready' && bad.length === 0;
if (!ok) { console.error('E2E FAILED'); process.exit(1); }
console.log('E2E PASS');
