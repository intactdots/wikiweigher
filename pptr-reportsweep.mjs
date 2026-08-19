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

const extPage = await browser.newPage();
await extPage.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
const ID = await extPage.evaluate(() => new Promise(res => chrome.developerPrivate.getExtensionsInfo(list => res(list[0]?.id))));
await extPage.close();
ok('extension id resolved', !!ID, ID);

const art = await browser.newPage();
await art.setViewport({ width: 1440, height: 1100 });
await art.goto('https://en.wikipedia.org/wiki/Mount_Everest', { waitUntil: 'domcontentloaded', timeout: 60000 });
await art.waitForFunction(() => document.documentElement.dataset.wikiweigherStatus === 'ready', { timeout: 120000, polling: 1000 });
ok('article run completed', true);

const pageData = await art.evaluate(() => ({ ...document.documentElement.dataset }));
ok('the extension log is not exposed to the page at all', !('wikiweigherLog' in pageData), Object.keys(pageData).join(','));
ok('only an opaque status token is exposed', pageData.wikiweigherStatus === 'ready' && !/[=,]/.test(pageData.wikiweigherStatus), pageData.wikiweigherStatus);
await art.close();

const opt = await browser.newPage();
opt.errors = [];
opt.on('pageerror', e => opt.errors.push(String(e.message || e).slice(0, 200)));
await opt.setViewport({ width: 1180, height: 1000 });
await opt.goto(`chrome-extension://${ID}/src/options/options.html#diag`, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1200));

const stored = await opt.evaluate(() => new Promise(res => chrome.storage.local.get('wikiweigherDiag', o => res(o.wikiweigherDiag))));
ok('stored diagnostics carry no full page address', !('url' in (stored || {})), Object.keys(stored || {}).join(','));
ok('stored diagnostics carry no raw user agent', !('ua' in (stored || {})));
ok('stored diagnostics identify the browser and system', !!stored?.browser && !!stored?.os, `${stored?.browser} / ${stored?.os}`);
ok('stored settings are a diff, not a dump', stored?.settings && Object.keys(stored.settings).length <= 2, JSON.stringify(stored?.settings));

const pane = await opt.evaluate(() => {
  const sec = document.querySelector('[data-view="diag"]');
  const order = [...sec.children].map(n => n.id || n.className.split(' ')[0]);
  const health = sec.querySelector('#health');
  const rep = sec.querySelector('.card.rep');
  return {
    label: [...document.querySelectorAll('.rbl')].map(e => e.textContent),
    visible: [...document.querySelectorAll('[data-view]')].filter(s => !s.hidden).map(s => s.dataset.view),
    body: document.getElementById('reportBody')?.textContent || '',
    buttons: ['reportOpen', 'diagCopy', 'reportDownload'].filter(id => !!document.getElementById(id)),
    order,
    healthBeforeReport: !!(health && rep) && (health.compareDocumentPosition(rep) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    collapsed: !sec.querySelector('.wgs')?.open,
    payloadVisible: document.getElementById('reportBody').checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }),
    hasIcon: !!sec.querySelector('#reportOpen svg'),
    visibleText: sec.innerText.replace(/\s+/g, ' ').trim().length
  };
});
ok('the pane is called Support and is the one shown', pane.label.includes('Support') && pane.visible.includes('diag'), pane.visible.join(','));
ok('last run comes before the report button', pane.healthBeforeReport, pane.order.join(' > '));
ok('the payload is collapsed, not shown as a wall of text', pane.collapsed && !pane.payloadVisible);
ok('the report button carries a bug icon', pane.hasIcon);
ok('the pane reads short', pane.visibleText < 900, `${pane.visibleText} visible chars`);
ok('the report is still available to read before sending', pane.body.length > 50, `${pane.body.length} chars`);
ok('the report carries the extension marker', pane.body.includes('wikiweigher-report/1'));
ok('the report contains no full wiki page address', !/https?:\/\/[a-z-]+\.wikipedia\.org\/wiki\//.test(pane.body));
ok('report, copy and download are all offered', pane.buttons.length === 3, pane.buttons.join(','));

const opened = await opt.evaluate(() => new Promise(res => {
  window.open = u => { res(u); return null; };
  document.getElementById('reportOpen').click();
  setTimeout(() => res(''), 4000);
}));
const u = opened ? new URL(opened) : null;
ok('report opens a GitHub issue form', !!u && u.hostname === 'github.com' && u.pathname.endsWith('/issues/new'), opened.slice(0, 90));
ok('the bug template is selected', u?.searchParams.get('template') === 'bug.yml');
ok('the diagnostics field is prefilled', (u?.searchParams.get('diagnostics') || '').includes('wikiweigher-report/1'));
ok('no permission-gated parameter is present', !['labels', 'assignees', 'milestone', 'projects'].some(k => u?.searchParams.has(k)));
ok('the link is inside the GitHub URL budget', !!opened && opened.length <= 7500, `${opened.length} chars`);

await opt.screenshot({ path: `${SHOTS}/support-pane.png` });
await opt.evaluate(() => { document.querySelector('.wgs').open = true; });
await new Promise(r => setTimeout(r, 400));
const opened2 = await opt.evaluate(() => ({
  payload: document.getElementById('reportBody').checkVisibility({ contentVisibilityAuto: true }),
  actions: ['diagCopy', 'reportDownload', 'diagRefresh'].filter(id => document.getElementById(id).checkVisibility({ contentVisibilityAuto: true }))
}));
ok('opening the disclosure reveals the payload and its actions', opened2.payload && opened2.actions.length === 3, opened2.actions.join(','));
await opt.screenshot({ path: `${SHOTS}/support-pane-open.png` });

await opt.evaluate(() => document.querySelector('.rb[data-pane="about"]').click());
await new Promise(r => setTimeout(r, 900));
const about = await opt.evaluate(() => ({
  version: document.getElementById('ab-version').textContent,
  log: document.getElementById('ab-changelog').textContent.trim(),
  rateHidden: !!document.getElementById('ab-rate').closest('.vr').hidden
}));
ok('About shows the current version', about.version === 'v1.0.0', about.version);
ok('what is new opens on the first release', /^1\.0\.0[\s\S]*First release/.test(about.log), about.log.split('\n').slice(0, 2).join(' / '));
ok('changelog entries are one-liners', about.log.split('\n').filter(l => l.trim().startsWith('-')).every(l => l.length < 120), 'longest ' + Math.max(...about.log.split('\n').map(l => l.length)));
ok('the rate link stays hidden while unlisted', about.rateHidden);
await opt.screenshot({ path: `${SHOTS}/about-pane.png` });
ok('no page errors on the options page', opt.errors.length === 0, opt.errors.join(' ; '));

await browser.close();
const fails = results.filter(r => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
if (fails.length) { console.log('FAILURES:'); fails.forEach(f => console.log('  - ' + f.name + (f.note ? ' | ' + f.note : ''))); process.exit(1); }
