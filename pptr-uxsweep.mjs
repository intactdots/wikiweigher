import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
import puppeteer from 'puppeteer';

const EXT = ROOT;
const results = [];
const ok = (name, pass, note = '') => { results.push({ name, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? '  | ' + note : ''}`); };

const browser = await puppeteer.launch({
  headless: false,
  protocolTimeout: 300000,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check', '--window-size=1500,1300']
});

async function freshPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1150 });
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e.message || e).slice(0, 200)));
  return page;
}

async function waitReady(page, timeout = 90000) {
  await page.bringToFront();
  await page.waitForFunction(() => document.documentElement.dataset.wikiweigherStatus === 'ready',
    { timeout, polling: 1000 });
  await new Promise(r => setTimeout(r, 700));
}

function shadow(page, fn, ...args) {
  return page.evaluate((body, ...a) => {
    const sr = document.getElementById('wikiweigher-host')?.shadowRoot;
    return new Function('sr', ...body.args, body.src)(sr, ...a);
  }, { src: `return (${fn})(sr, ...rest)`, args: ['...rest'] }, ...args);
}

const p1 = await freshPage();
await p1.goto('https://en.wikipedia.org/wiki/Mount_Everest', { waitUntil: 'domcontentloaded', timeout: 60000 });
await waitReady(p1);

const base = await shadow(p1, sr => ({
  card: !!sr?.querySelector('.cx-card'),
  rows: sr.querySelectorAll('.cx-row').length,
  exactRows: [...sr.querySelectorAll('.cx-row-stat')].filter(s => !s.textContent.includes('~')).length,
  estRows: [...sr.querySelectorAll('.cx-row-stat')].filter(s => s.textContent.includes('~')).length,
  bestLabel: sr.querySelector('.cx-best-label')?.textContent || '',
  bestName: sr.querySelector('.cx-best-name')?.textContent || '',
  youChip: !!sr.querySelector('.cx-best .cx-you'),
  colhead: sr.querySelector('.cx-colhead')?.textContent || '',
  foot: sr.querySelector('.cx-foot-note')?.textContent || '',
  curRow: !!sr.querySelector('.cx-row.cx-current'),
  bars: [...sr.querySelectorAll('.cx-bar-fill')].filter(f => parseFloat(f.style.width) > 0).length,
  badges: sr.querySelectorAll('.cx-badge').length,
  minBtn: !!sr.querySelector('[data-act="min"]'),
  closeBtn: !!sr.querySelector('[data-act="close"]')
}));
ok('card renders ready', base.card, `rows=${base.rows}`);
ok('default analyze=12 rows exact', base.exactRows === 12, `exact=${base.exactRows} est=${base.estRows}`);
ok('hero names best + label', !!base.bestName && /best/i.test(base.bestLabel), `${base.bestLabel}: ${base.bestName}`);
ok('current row highlighted', base.curRow);
ok('score bars drawn', base.bars >= 10, `bars=${base.bars}`);
ok('quality badges shown', base.badges >= 1, `badges=${base.badges}`);
ok('column header present', /language/i.test(base.colhead) && /words/i.test(base.colhead));
ok('footer shows total langs', /in \d+ languages/i.test(base.foot), base.foot);

const rowLang = await shadow(p1, sr => {
  const r = [...sr.querySelectorAll('.cx-row')].find(x => !x.classList.contains('cx-current') && !x.querySelector('.cx-row-stat')?.textContent.includes('~'));
  return r ? r.dataset.lang : null;
});
const beforeTargets = (await browser.targets()).length;
await shadow(p1, (sr, lang) => { sr.querySelector(`.cx-row[data-lang="${lang}"]`).click(); }, rowLang);
await new Promise(r => setTimeout(r, 2500));
const targets = await browser.targets();
const opened = targets.find(t => t.url().includes('wikipedia.org') && t.url() !== p1.url() && t.type() === 'page');
ok('row click opens that language article', targets.length > beforeTargets && !!opened, opened ? opened.url().slice(0, 70) : 'no new tab');
if (opened) try { (await opened.page())?.close(); } catch {}

await shadow(p1, sr => sr.querySelector('[data-act="min"]').click());
await new Promise(r => setTimeout(r, 400));
const pillState = await shadow(p1, sr => ({ pill: !!sr.querySelector('.cx-pill'), card: !!sr.querySelector('.cx-card'), text: sr.querySelector('.cx-pill')?.textContent || '' }));
ok('minimize -> pill names real best (no re-run)', pillState.pill && !pillState.card && !pillState.text.includes('…'), pillState.text.trim());
await shadow(p1, sr => sr.querySelector('[data-act="restore"]').click());
await new Promise(r => setTimeout(r, 400));
const restored = await shadow(p1, sr => !!sr.querySelector('.cx-card'));
ok('restore -> card back', restored);

const hb = await p1.evaluate(() => {
  const h = document.getElementById('wikiweigher-host');
  const r = h.getBoundingClientRect();
  return { x: r.left, y: r.top };
});
await p1.mouse.move(hb.x + 80, hb.y + 18);
await p1.mouse.down();
await p1.mouse.move(hb.x + 80 - 300, hb.y + 18 + 160, { steps: 12 });
await p1.mouse.up();
await new Promise(r => setTimeout(r, 900));
const dragPos = await p1.evaluate(() => {
  const h = document.getElementById('wikiweigher-host');
  return { top: parseFloat(h.style.top), left: parseFloat(h.style.left) };
});
ok('drag moves card', Math.abs(dragPos.top - (hb.y + 160)) < 30 && dragPos.left > 0, `top=${dragPos.top} left=${dragPos.left}`);

await p1.reload({ waitUntil: 'domcontentloaded' });
await waitReady(p1);
const persisted = await p1.evaluate(() => {
  const h = document.getElementById('wikiweigher-host');
  return { top: parseFloat(h.style.top), left: parseFloat(h.style.left) };
});
ok('position persists across reload', Math.abs(persisted.top - dragPos.top) < 8 && Math.abs(persisted.left - dragPos.left) < 8, `top=${persisted.top} left=${persisted.left}`);

await shadow(p1, sr => sr.querySelector('[data-act="close"]').click());
await new Promise(r => setTimeout(r, 300));
const closed = await p1.evaluate(() => !document.getElementById('wikiweigher-host'));
ok('close removes card for page', closed);
ok('no page errors on Everest', p1.errors.length === 0, p1.errors.join(' ; '));
await p1.close();

const p2 = await freshPage();
await p2.goto('https://en.wikipedia.org/wiki/Photosynthesis', { waitUntil: 'domcontentloaded', timeout: 60000 });
await waitReady(p2);
const dw = await shadow(p2, sr => ({
  bestName: sr.querySelector('.cx-best-name')?.textContent || '',
  bestEn: sr.querySelector('.cx-best-en')?.textContent || '',
  open: !!sr.querySelector('.cx-open'),
  translate: !!sr.querySelector('.cx-translate'),
  reason: sr.querySelector('.cx-best-reason')?.textContent || '',
  sourced: sr.querySelector('.cx-sourced')?.textContent || null
}));
ok('foreign best named + Open btn', !!dw.bestName && dw.open, `${dw.bestName} (${dw.bestEn}) | ${dw.reason}`);
ok('translate offered for unread winner', dw.translate);
if (dw.translate) {
  await shadow(p2, sr => sr.querySelector('.cx-translate').click());
  await new Promise(r => setTimeout(r, 2500));
  const tt = (await browser.targets()).find(t => t.url().includes('translate.goog') || t.url().includes('translate.google.com'));
  ok('translate opens google translate', !!tt, tt ? tt.url().slice(0, 80) : 'no tab');
  if (tt) try { (await tt.page())?.close(); } catch {}
}
ok('no page errors on Photosynthesis', p2.errors.length === 0, p2.errors.join(' ; '));
await p2.close();

const p3 = await freshPage();
await p3.goto('https://en.wikipedia.org/wiki/Main_Page', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 6000));
ok('Main_Page suppressed', await p3.evaluate(() => !document.getElementById('wikiweigher-host')));
await p3.close();

const p4 = await freshPage();
await p4.goto('https://ar.wikipedia.org/wiki/%D8%A7%D9%84%D9%82%D8%A7%D9%87%D8%B1%D8%A9', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
await waitReady(p4).catch(async () => { await new Promise(r => setTimeout(r, 2000)); await waitReady(p4); });
const rtl = await shadow(p4, sr => ({ dir: sr.querySelector('.cx-card')?.getAttribute('dir'), label: sr.querySelector('.cx-best-label')?.textContent || '' }));
ok('RTL card on ar.wikipedia', rtl.dir === 'rtl', `dir=${rtl.dir} label=${rtl.label}`);
ok('arabic i18n labels', /[؀-ۿ]/.test(rtl.label), rtl.label);
ok('no page errors on Cairo-ar', p4.errors.length === 0, p4.errors.join(' ; '));
await p4.close();

const p5 = await freshPage();
await p5.goto('https://de.wikipedia.org/wiki/Photosynthese', { waitUntil: 'domcontentloaded', timeout: 60000 });
await waitReady(p5);
const de = await shadow(p5, sr => ({ label: sr.querySelector('.cx-best-label')?.textContent || '', col: sr.querySelector('.cx-colhead')?.textContent || '' }));
ok('german i18n labels', /BESTEN|BESTE/i.test(de.label) || /Wörter/i.test(de.col), `${de.label} | ${de.col}`);
ok('no page errors on de', p5.errors.length === 0, p5.errors.join(' ; '));
await p5.close();

await browser.close();
const fails = results.filter(r => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
if (fails.length) { console.log('FAILURES:'); fails.forEach(f => console.log('  - ' + f.name + (f.note ? ' | ' + f.note : ''))); process.exit(1); }
