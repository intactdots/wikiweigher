import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const EXT = ROOT;
const SHOTS = ROOT + '/.artifacts';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, pass, note = '') => { results.push({ name, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? '  | ' + note : ''}`); };

const browser = await puppeteer.launch({
  headless: false,
  protocolTimeout: 300000,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check', '--window-size=1500,1300']
});

let blocking = true;

async function freshPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1150 });
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e.message || e).slice(0, 200)));
  await page.setRequestInterception(true);
  page.on('request', r => {
    if (blocking && /wikipedia\.org\/w\/api\.php|wikidata\.org\/w\/api\.php/.test(r.url())) { r.abort('failed').catch(() => {}); return; }
    r.continue().catch(() => {});
  });
  return page;
}

function shadow(page, fn, ...args) {
  return page.evaluate((body, ...a) => {
    const sr = document.getElementById('wikiweigher-host')?.shadowRoot;
    return new Function('sr', ...body.args, body.src)(sr, ...a);
  }, { src: `return (${fn})(sr, ...rest)`, args: ['...rest'] }, ...args);
}

async function shot(page, name) {
  try {
    const el = await page.$('#wikiweigher-host');
    if (el) await el.screenshot({ path: `${SHOTS}/${name}.png` });
  } catch {}
}

const extPage = await browser.newPage();
await extPage.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
const ID = await extPage.evaluate(() => new Promise(res => chrome.developerPrivate.getExtensionsInfo(list => res(list[0]?.id))));
await extPage.close();
ok('extension id resolved', !!ID, ID);

async function readDiag() {
  const page = await browser.newPage();
  try {
    await page.goto(`chrome-extension://${ID}/src/options/options.html`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 400));
    return await page.evaluate(() => new Promise(res => chrome.storage.local.get('wikiweigherDiag', o => res(o.wikiweigherDiag))));
  } finally {
    await page.close().catch(() => {});
  }
}

const p = await freshPage();
await p.goto('https://en.wikipedia.org/wiki/Mount_Everest', { waitUntil: 'domcontentloaded', timeout: 60000 });

await p.waitForFunction(() => {
  const sr = document.getElementById('wikiweigher-host')?.shadowRoot;
  return !!sr?.querySelector('.cx-error');
}, { timeout: 60000, polling: 500 }).then(() => ok('a dead API renders the error card, not a spinner', true)).catch(() => ok('a dead API renders the error card, not a spinner', false));

const err = await shadow(p, sr => ({
  head: sr.querySelector('.cx-error-head')?.textContent?.trim() || '',
  msg: sr.querySelector('.cx-error-msg')?.textContent?.trim() || '',
  retry: !!sr.querySelector('[data-act="retry"]'),
  report: !!sr.querySelector('[data-act="report"]'),
  spinner: !!sr.querySelector('.cx-loading'),
  rows: sr.querySelectorAll('.cx-row').length,
  cardVisible: !!sr.querySelector('.cx-card')
}));
ok('the card stays on screen instead of vanishing', err.cardVisible);
ok('error names the problem in plain language', err.msg.length > 20, err.msg);
ok('retry and report are both offered', err.retry && err.report);
ok('no spinner and no stale rows behind the error', !err.spinner && err.rows === 0, `spinner=${err.spinner} rows=${err.rows}`);
await shot(p, 'error-card');

const beforeReport = (await browser.targets()).length;
await shadow(p, sr => sr.querySelector('[data-act="report"]').click());
await new Promise(r => setTimeout(r, 2500));
const supportTab = (await browser.targets()).find(t => t.url().includes('options.html'));
ok('report opens the Support pane without the page being web accessible',
  !!supportTab && supportTab.url().includes('#diag'),
  supportTab ? supportTab.url().split('/').slice(-1)[0] : `no new tab, targets ${beforeReport}`);
if (supportTab) { try { await (await supportTab.page())?.close(); } catch {} }


const diag = await readDiag();
ok('diagnostics record the real failure, not too-few-languages', diag?.phase === 'error' && diag?.errorKind === 'network', `phase=${diag?.phase} kind=${diag?.errorKind}`);

blocking = false;
await shadow(p, sr => sr.querySelector('[data-act="retry"]').click());
await p.waitForFunction(() => {
  const sr = document.getElementById('wikiweigher-host')?.shadowRoot;
  return !!sr?.querySelector('.cx-best-name');
}, { timeout: 120000, polling: 1000 }).then(() => ok('retry recovers once the network is back', true)).catch(() => ok('retry recovers once the network is back', false));

const back = await shadow(p, sr => ({
  best: sr.querySelector('.cx-best-name')?.textContent || '',
  rows: sr.querySelectorAll('.cx-row').length,
  error: !!sr.querySelector('.cx-error')
}));
ok('recovered card is a normal ranked card', !back.error && back.rows > 0, `best=${back.best} rows=${back.rows}`);
await shot(p, 'recovered-card');
ok('no uncaught page errors throughout', p.errors.length === 0, p.errors.join(' ; '));

await browser.close();
const fails = results.filter(r => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
if (fails.length) { console.log('FAILURES:'); fails.forEach(f => console.log('  - ' + f.name + (f.note ? ' | ' + f.note : ''))); process.exit(1); }
