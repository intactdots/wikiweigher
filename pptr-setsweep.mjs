import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
import puppeteer from 'puppeteer';

const EXT = ROOT;
const results = [];
const ok = (name, pass, note = '') => { results.push({ name, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? '  | ' + note : ''}`); };

const browser = await puppeteer.launch({
  headless: false,
  protocolTimeout: 300000,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check', '--window-size=1500,1300', '--disable-features=MemorySaver,HighEfficiencyModeAvailable', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
});

async function withPopup(fn) {
  const p = await browser.newPage();
  await p.goto(`chrome-extension://${ID}/src/popup/popup.html`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));
  try { return await fn(p); } finally { await p.close().catch(() => {}); }
}

const ext = await browser.newPage();
await ext.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
const ID = await ext.evaluate(() => new Promise(res => chrome.developerPrivate.getExtensionsInfo(list => res(list[0]?.id))));
ok('extension id resolved', !!ID, ID);
await ext.close();

const art = await browser.newPage();
await art.setViewport({ width: 1440, height: 1150 });
art.reqs = [];
art.on('request', r => { const u = r.url(); if (u.includes('api.php') && u.includes('origin=*')) art.reqs.push(u); });
await art.goto('https://en.wikipedia.org/wiki/Coffee', { waitUntil: 'domcontentloaded', timeout: 60000 });
const ready = () => art.waitForFunction(() => document.documentElement.dataset.wikiweigherStatus === 'ready', { timeout: 90000, polling: 1000 });
await ready().catch(async () => {
  const log = await art.evaluate(() => document.documentElement.dataset.wikiweigherStatus || '(none)');
  console.log('   first-load status: ' + log + ' -- reloading once');
  await art.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await ready();
});
ok('card ready + made API calls', art.reqs.length > 0, `apiCalls=${art.reqs.length}`);

const popState = await withPopup(p => p.evaluate(() => ({
  enabled: document.getElementById('enabled').checked,
  presets: [...document.querySelectorAll('#presets button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join(' '),
  completeness: [...document.querySelectorAll('#completeness button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join(' ')
})));
ok('popup renders with state', popState.enabled === true && popState.presets.includes('Balanced*') && popState.completeness.includes('Standard*'), `${popState.presets} | ${popState.completeness}`);

await withPopup(async p => { await p.click('.toggle'); await new Promise(r => setTimeout(r, 1200)); });
const offRemoved = await art.evaluate(() => !document.getElementById('wikiweigher-host'));
ok('popup OFF removes card live', offRemoved);

art.reqs = [];
await art.reload({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
await new Promise(r => setTimeout(r, 8000));
const offState = await art.evaluate(() => ({ host: !!document.getElementById('wikiweigher-host'), log: document.documentElement.dataset.wikiweigherStatus || '' }));
ok('disabled: no card on fresh load', !offState.host, offState.log);
ok('disabled: ZERO extension API requests', art.reqs.length === 0, `apiCalls=${art.reqs.length}`);

await withPopup(async p => { await p.click('.toggle'); await new Promise(r => setTimeout(r, 1200)); });
await art.waitForFunction(() => document.documentElement.dataset.wikiweigherStatus === 'ready', { timeout: 90000, polling: 1000 }).catch(() => {});
const backOn = await art.evaluate(() => {
  const sr = document.getElementById('wikiweigher-host')?.shadowRoot;
  return { host: !!sr, rows: sr ? sr.querySelectorAll('.cx-row').length : 0 };
});
ok('popup ON restores card live (no reload)', backOn.host && backOn.rows > 0, `rows=${backOn.rows}`);

await withPopup(async p => { await p.evaluate(() => { document.querySelector('#completeness button[data-a="6"]').click(); }); await new Promise(r => setTimeout(r, 800)); });
await art.waitForFunction(() => {
  const sr = document.getElementById('wikiweigher-host')?.shadowRoot;
  return sr && sr.querySelectorAll('.cx-row').length === 6 && ![...sr.querySelectorAll('.cx-row-stat')].some(s => s.textContent.includes('~'));
}, { timeout: 90000, polling: 1000 }).then(() => ok('popup analyze=6 live-applies: exactly 6 rows', true)).catch(async () => {
  const n = await art.evaluate(() => document.getElementById('wikiweigher-host')?.shadowRoot?.querySelectorAll('.cx-row').length);
  ok('popup analyze=6 live-applies: exactly 6 rows', false, `rows=${n}`);
});

const stored = await withPopup(async p => {
  await p.evaluate(() => { document.querySelector('#presets button[data-p="sourced"]').click(); });
  await new Promise(r => setTimeout(r, 900));
  return p.evaluate(() => new Promise(res => chrome.storage.local.get('settings', o => res(o.settings))));
});
ok('popup preset persists weight and stores no derived preset', stored.weight === 0.25 && !('preset' in stored), `weight=${stored.weight} preset=${'preset' in stored}`);
await withPopup(async p => {
  await p.evaluate(() => { document.querySelector('#presets button[data-p="balanced"]').click(); });
  await new Promise(r => setTimeout(r, 500));
  await p.evaluate(() => { document.querySelector('#completeness button[data-a="12"]').click(); });
  await new Promise(r => setTimeout(r, 700));
});

const opt = await browser.newPage();
await opt.setViewport({ width: 1100, height: 900 });
await opt.goto(`chrome-extension://${ID}/src/options/options.html`, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 700));
const rail = await opt.evaluate(() => {
  const out = [];
  const rails = document.querySelectorAll('.rb');
  for (const b of rails) {
    b.click();
    const visible = [...document.querySelectorAll('[data-view]')].filter(s => !s.hidden).map(s => s.dataset.view);
    out.push(b.dataset.pane + ':' + visible.join(','));
  }
  return { panes: out, rails: rails.length };
});
ok('options rail switches every pane', rail.rails > 0 && rail.panes.length === rail.rails && rail.panes.every(p => { const [a, b] = p.split(':'); return a === b; }), `${rail.rails} panes | ${rail.panes.join(' ')}`);

await art.waitForFunction(() => {
  const sr = document.getElementById('wikiweigher-host')?.shadowRoot;
  return sr && sr.querySelectorAll('.cx-row').length === 12 && !sr.querySelector('.cx-loading');
}, { timeout: 90000, polling: 1000 });
await new Promise(r => setTimeout(r, 2500));
art.reqs = [];
await opt.evaluate(() => { document.querySelector('.rb[data-pane="display"]').click(); document.querySelector('#accents .acd[data-accent="rose"]').click(); });
await new Promise(r => setTimeout(r, 1200));
const accApplied = await art.evaluate(() => {
  const sr = document.getElementById('wikiweigher-host')?.shadowRoot;
  const card = sr?.querySelector('.cx-card, .cx-pill');
  return card ? { acc: card.style.getPropertyValue('--cx-acc').trim(), loading: !!sr.querySelector('.cx-loading'), rows: sr.querySelectorAll('.cx-row').length } : null;
});
ok('accent rose applies in place (fast)', accApplied?.acc === '#e5484d' && !accApplied.loading && accApplied.rows > 0, JSON.stringify(accApplied));

await opt.evaluate(() => { document.querySelector('#themes .thb[data-t="dark"]').click(); });
await new Promise(r => setTimeout(r, 1200));
const darkApplied = await art.evaluate(() => {
  const sr = document.getElementById('wikiweigher-host')?.shadowRoot;
  const card = sr?.querySelector('.cx-card, .cx-pill');
  return card ? { theme: card.getAttribute('data-theme'), bg: getComputedStyle(card).backgroundColor, loading: !!sr.querySelector('.cx-loading') } : null;
});
ok('theme dark applies in place', !!darkApplied && darkApplied.theme === 'dark' && !darkApplied.loading, JSON.stringify(darkApplied));
ok('card dark bg = Blurdrift #0f1011', darkApplied?.bg === 'rgb(15, 16, 17)', darkApplied?.bg);
ok('presentation changes made ZERO API calls', art.reqs.length === 0, `apiCalls=${art.reqs.length}`);
const optDark = await opt.evaluate(() => ({ attr: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor }));
ok('options dark bg = Blurdrift #010102', optDark.attr === 'dark' && optDark.bg === 'rgb(1, 1, 2)', JSON.stringify(optDark));

await art.evaluate(() => { document.getElementById('wikiweigher-host').shadowRoot.querySelector('[data-act="close"]').click(); });
await new Promise(r => setTimeout(r, 400));
await opt.evaluate(() => { document.querySelector('#accents .acd[data-accent="teal"]').click(); });
await new Promise(r => setTimeout(r, 1400));
const stayedClosed = await art.evaluate(() => !document.getElementById('wikiweigher-host'));
ok('closed card stays closed on settings change', stayedClosed);
await withPopup(async p => { await p.click('.toggle'); await new Promise(r => setTimeout(r, 900)); await p.click('.toggle'); });
await art.waitForFunction(() => !!document.getElementById('wikiweigher-host'), { timeout: 60000, polling: 1000 }).then(() => ok('off->on re-enables after close', true)).catch(() => ok('off->on re-enables after close', false));

await opt.evaluate(() => { document.querySelector('.rb[data-pane="diag"]').click(); });
await new Promise(r => setTimeout(r, 900));
const diag = await opt.evaluate(() => ({
  rows: document.querySelectorAll('#health .hrow').length,
  text: document.getElementById('health').innerText.replace(/\n+/g, ' | ').slice(0, 400),
  badges: document.querySelectorAll('#health .bdg').length,
  copyBtn: !!document.getElementById('diagCopy'),
  ready: /ready/i.test(document.getElementById('health').innerText)
}));
const healthText = await opt.evaluate(() => document.getElementById('health').textContent);
ok('health table shows real values, never NaN or undefined', !/NaN|undefined/.test(healthText), healthText.match(/NaN|undefined/g)?.join(',') || 'clean');
ok('diagnostics health table populated',diag.rows >= 10 && diag.ready, `rows=${diag.rows} badges=${diag.badges}`);
console.log('   diag: ' + diag.text);

const report = await opt.evaluate(async () => {
  const obj = await chrome.storage.local.get(['wikiweigherDiag', 'wikiweigherDebug']);
  return { hasDiag: !!obj.wikiweigherDiag, phase: obj.wikiweigherDiag?.phase, analyzed: obj.wikiweigherDiag?.analyzed?.length, best: obj.wikiweigherDiag?.best?.lang, ms: obj.wikiweigherDiag?.ms };
});
ok('diag storage complete for bug reports', report.hasDiag && report.phase === 'ready' && report.analyzed > 0 && !!report.best, JSON.stringify(report));

const reset = await opt.evaluate(async () => {
  const { setSettings, DEFAULTS } = await import('../settings/settings.js');
  const { setLayout, LAYOUT_DEFAULTS } = await import('../settings/layout.js');
  await setSettings(DEFAULTS, chrome.storage.local);
  await setLayout(LAYOUT_DEFAULTS, chrome.storage.local);
  return new Promise(res => chrome.storage.local.get(['settings', 'wikiweigherLayout'], o => res({ s: o.settings, l: o.wikiweigherLayout })));
});
ok('settings reset to defaults', reset.s.weight === 0.5 && reset.s.analyze === 12 && reset.l.position === null, JSON.stringify(reset));

await browser.close();
const fails = results.filter(r => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
if (fails.length) { console.log('FAILURES:'); fails.forEach(f => console.log('  - ' + f.name + (f.note ? ' | ' + f.note : ''))); process.exit(1); }
