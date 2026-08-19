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

const extPage = await browser.newPage();
await extPage.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
const ID = await extPage.evaluate(() => new Promise(res => chrome.developerPrivate.getExtensionsInfo(list => res(list[0]?.id))));
await extPage.close();
ok('extension id resolved', !!ID, ID);

async function extTab(hash = '') {
  const p = await browser.newPage();
  p.errors = [];
  p.on('pageerror', e => p.errors.push(String(e.message || e).slice(0, 200)));
  await p.setViewport({ width: 1180, height: 950 });
  await p.goto(`chrome-extension://${ID}/src/options/options.html${hash}`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 700));
  return p;
}

const cmdPage = await extTab();
const commands = await cmdPage.evaluate(() => new Promise(res => chrome.commands.getAll(list => res(list.map(c => ({ name: c.name, shortcut: c.shortcut, description: c.description }))))));
const byName = Object.fromEntries(commands.map(c => [c.name, c]));
ok('both keyboard commands are registered', !!byName._execute_action && !!byName['toggle-enabled'], commands.map(c => `${c.name}=${c.shortcut || 'unbound'}`).join(' '));
ok('every declared shortcut actually bound', commands.every(c => !!c.shortcut), commands.map(c => `${c.name}=${c.shortcut || 'UNBOUND'}`).join(' '));
ok('command descriptions resolved from _locales', /Wikiweigher/.test(byName['toggle-enabled']?.description || ''), byName['toggle-enabled']?.description);

const toggled = await cmdPage.evaluate(async () => {
  const { getSettings, setSettings } = await import('../settings/settings.js');
  const before = (await getSettings(chrome.storage.local)).enabled;
  await setSettings({ enabled: !before }, chrome.storage.local);
  const after = (await getSettings(chrome.storage.local)).enabled;
  await setSettings({ enabled: before }, chrome.storage.local);
  return { before, after };
});
ok('the toggle command handler flips enabled', toggled.before !== toggled.after, `${toggled.before} -> ${toggled.after}`);
await cmdPage.close();

const badgePage = await extTab();
await badgePage.evaluate(() => new Promise(res => chrome.storage.local.set({ wikiweigherUpdated: '1.0.0' }, () => chrome.action.setBadgeText({ text: ' ' }, res))));
await new Promise(r => setTimeout(r, 500));
const badgeBefore = await badgePage.evaluate(() => chrome.action.getBadgeText({}));
ok('an update sets a badge', badgeBefore.trim() === '' && badgeBefore.length > 0, JSON.stringify(badgeBefore));

await badgePage.evaluate(() => document.querySelector('.rb[data-pane="about"]').click());
await new Promise(r => setTimeout(r, 1500));
const afterAbout = await badgePage.evaluate(async () => ({
  badge: await chrome.action.getBadgeText({}),
  flag: await new Promise(res => chrome.storage.local.get('wikiweigherUpdated', o => res(o.wikiweigherUpdated ?? null)))
}));
ok('opening About clears the update flag', afterAbout.flag === null);
ok('opening About clears the badge', afterAbout.badge === '', JSON.stringify(afterAbout.badge));
await badgePage.close();

const bootPage = await extTab();
const banner = await bootPage.evaluate(async () => {
  const s = document.createElement('script');
  s.src = 'does-not-exist.js';
  document.head.appendChild(s);
  await new Promise(r => setTimeout(r, 900));
  const box = [...document.querySelectorAll('[role="alert"]')].find(n => /could not load/i.test(n.textContent));
  return box ? box.textContent.slice(0, 90) : '';
});
ok('a failed resource shows the load-failure banner', banner.length > 0, banner);

const once = await bootPage.evaluate(async () => {
  const s = document.createElement('script');
  s.src = 'also-missing.js';
  document.head.appendChild(s);
  await new Promise(r => setTimeout(r, 700));
  return document.querySelectorAll('[role="alert"]').length;
});
ok('the banner appears once, not once per failure', once === 1, `${once} banners`);
await bootPage.close();

async function loadingCard(reduced) {
  const p = await browser.newPage();
  p.errors = [];
  p.on('pageerror', e => p.errors.push(String(e.message || e).slice(0, 200)));
  await p.setViewport({ width: 1440, height: 1000 });
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }]);
  await p.setRequestInterception(true);
  p.on('request', async r => {
    if (/wikipedia\.org\/w\/api\.php/.test(r.url())) { await new Promise(x => setTimeout(x, 9000)); }
    r.continue().catch(() => {});
  });
  await p.goto('https://en.wikipedia.org/wiki/Mount_Everest', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => !!document.getElementById('wikiweigher-host')?.shadowRoot?.querySelector('.cx-loading'), { timeout: 40000, polling: 100 });
  const spin = await p.evaluate(() => {
    const el = document.getElementById('wikiweigher-host').shadowRoot.querySelector('.cx-loading');
    return getComputedStyle(el, '::before').animationName;
  });
  await p.close();
  return spin;
}

const spinNormal = await loadingCard(false);
ok('the spinner animates normally', spinNormal === 'cxspin', spinNormal);
const spinReduced = await loadingCard(true);
ok('reduced motion stops the spinner', spinReduced === 'none', spinReduced);

const fc = await browser.newPage();
await fc.setViewport({ width: 1440, height: 1000 });
const fcClient = await fc.createCDPSession();
await fcClient.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
await fc.goto('https://en.wikipedia.org/wiki/Mount_Everest', { waitUntil: 'domcontentloaded', timeout: 60000 });
await fc.waitForFunction(() => !!document.getElementById('wikiweigher-host')?.shadowRoot?.querySelector('.cx-card'), { timeout: 60000, polling: 500 });
const border = await fc.evaluate(() => {
  const card = document.getElementById('wikiweigher-host').shadowRoot.querySelector('.cx-card');
  return getComputedStyle(card).borderTopWidth;
});
ok('forced colours gives the card a real border', border !== '0px', border);
await fc.close();

const off = await browser.newPage();
off.errors = [];
off.on('pageerror', e => off.errors.push(String(e.message || e).slice(0, 200)));
await off.setViewport({ width: 1440, height: 1000 });
await off.goto('https://en.wikipedia.org/wiki/Mount_Everest', { waitUntil: 'domcontentloaded', timeout: 60000 });
await off.waitForFunction(() => document.documentElement.dataset.wikiweigherStatus === 'ready', { timeout: 120000, polling: 1000 });

const client = await off.createCDPSession();
await client.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
const wentOffline = await off.evaluate(() => navigator.onLine === false);
ok('the browser reports being offline', wentOffline);

const driver = await extTab();
await driver.evaluate(async () => {
  const { setSettings } = await import('../settings/settings.js');
  await setSettings({ analyze: 6 }, chrome.storage.local);
});
await off.waitForFunction(() => !!document.getElementById('wikiweigher-host')?.shadowRoot?.querySelector('.cx-error'), { timeout: 90000, polling: 1000 }).catch(() => {});
const offText = await off.evaluate(() => {
  const sr = document.getElementById('wikiweigher-host')?.shadowRoot;
  return { msg: sr?.querySelector('.cx-error-msg')?.textContent || '', status: document.documentElement.dataset.wikiweigherStatus || '' };
});
ok('an offline run says offline, not just connection failed', /offline/i.test(offText.msg), `${offText.status} | ${offText.msg}`);
ok('the offline card still offers a way out', await off.evaluate(() => {
  const sr = document.getElementById('wikiweigher-host')?.shadowRoot;
  return !!sr?.querySelector('[data-act="retry"]') && !!sr?.querySelector('[data-act="report"]');
}));

await client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await off.evaluate(() => document.getElementById('wikiweigher-host').shadowRoot.querySelector('[data-act="retry"]').click());
const recovered = await off.waitForFunction(() => !!document.getElementById('wikiweigher-host')?.shadowRoot?.querySelector('.cx-best-name'), { timeout: 120000, polling: 1000 }).then(() => true).catch(() => false);
ok('reconnecting and retrying recovers', recovered);
await driver.evaluate(async () => {
  const { setSettings } = await import('../settings/settings.js');
  await setSettings({ analyze: 12 }, chrome.storage.local);
});
await driver.close();
ok('no page errors during the offline run', off.errors.length === 0, off.errors.join(' ; '));
await off.close();

await browser.close();
const fails = results.filter(r => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
if (fails.length) { console.log('FAILURES:'); fails.forEach(f => console.log('  - ' + f.name + (f.note ? ' | ' + f.note : ''))); process.exit(1); }
