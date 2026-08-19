import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';

const EXT = process.env.EXT || ROOT;
const VERSION = JSON.parse(readFileSync(ROOT + '/manifest.json', 'utf8')).version;
const results = [];
const ok = (name, pass, note = '') => { results.push({ name, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? '  | ' + note : ''}`); };

const browser = await puppeteer.launch({
  headless: false,
  protocolTimeout: 300000,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check', '--window-size=1500,1300', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
});

const ext = await browser.newPage();
await ext.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
const ID = await ext.evaluate(() => new Promise(res => chrome.developerPrivate.getExtensionsInfo(list => res(list[0]?.id))));
await ext.close();

async function storage(fn, arg) {
  const p = await browser.newPage();
  await p.goto(`chrome-extension://${ID}/src/options/options.html`, { waitUntil: 'domcontentloaded' });
  const out = await p.evaluate(fn, arg);
  await p.close();
  return out;
}
const getRate = () => storage(() => new Promise(res => chrome.storage.local.get('wikiweigherRate', o => res(o.wikiweigherRate))));
const setRateState = v => storage(x => chrome.storage.local.set({ wikiweigherRate: x }), v);

await setRateState({ runs: 4, next: 5, done: false });

const art = await browser.newPage();
await art.setViewport({ width: 1440, height: 1150 });
await art.goto('https://en.wikipedia.org/wiki/Mount_Everest', { waitUntil: 'domcontentloaded', timeout: 60000 });
let done = false;
for (let i = 0; i < 4 && !done; i++) {
  done = await art.waitForFunction(() => document.documentElement.dataset.wikiweigherStatus === 'ready', { timeout: 60000, polling: 1000 }).then(() => true).catch(() => false);
  if (!done) await new Promise(r => setTimeout(r, 4000));
}
await new Promise(r => setTimeout(r, 800));

const banner = await art.evaluate(() => {
  const sr = document.getElementById('wikiweigher-host')?.shadowRoot;
  const b = sr?.querySelector('.cx-rate');
  return { present: !!b, text: b ? b.textContent.trim() : '', rate: !!sr?.querySelector('[data-act="rate"]'), later: !!sr?.querySelector('[data-act="rate-later"]'), never: !!sr?.querySelector('[data-act="rate-never"]') };
});
ok('rate banner appears at threshold (5th run)', banner.present && banner.rate && banner.later && banner.never, banner.text.slice(0, 60));

await art.evaluate(() => { document.getElementById('wikiweigher-host').shadowRoot.querySelector('[data-act="rate-later"]').click(); });
await new Promise(r => setTimeout(r, 900));
const afterLater = await art.evaluate(async () => {
  const sr = document.getElementById('wikiweigher-host')?.shadowRoot;
  return { banner: !!sr?.querySelector('.cx-rate'), card: !!sr?.querySelector('.cx-card') };
});
const rateState = await getRate();
ok('Later dismisses + defers 15 runs', !afterLater.banner && afterLater.card && rateState.next === rateState.runs + 15 && !rateState.done, JSON.stringify(rateState));

await setRateState({ runs: 30, next: 20, done: false });
await art.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
done = false;
for (let i = 0; i < 4 && !done; i++) {
  done = await art.waitForFunction(() => document.documentElement.dataset.wikiweigherStatus === 'ready', { timeout: 60000, polling: 1000 }).then(() => true).catch(() => false);
  if (!done) await new Promise(r => setTimeout(r, 4000));
}
await new Promise(r => setTimeout(r, 800));
const before = (await browser.targets()).length;
await art.evaluate(() => { document.getElementById('wikiweigher-host').shadowRoot.querySelector('[data-act="rate"]').click(); });
await new Promise(r => setTimeout(r, 2500));
const rateTab = (await browser.targets()).find(t => t.url().includes('chromewebstore.google.com'));
const ratedState = await getRate();
ok('Rate opens store reviews + never again', (await browser.targets()).length > before && !!rateTab && ratedState.done === true, rateTab ? rateTab.url().slice(0, 75) : 'no tab');
if (rateTab) try { (await rateTab.page())?.close(); } catch {}
const bannerGone = await art.evaluate(() => !document.getElementById('wikiweigher-host').shadowRoot.querySelector('.cx-rate'));
ok('banner gone after rating', bannerGone);
await art.close();

const opt = await browser.newPage();
await opt.goto(`chrome-extension://${ID}/src/options/options.html#about`, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1200));
const about = await opt.evaluate(() => ({
  visible: ![...document.querySelectorAll('[data-view]')].find(s => s.dataset.view === 'about').hidden,
  version: document.getElementById('ab-version').textContent,
  rateHref: document.getElementById('ab-rate').href,
  brand: !!document.querySelector('.brandhero img.bh-lockup'),
  github: !!document.querySelector('a[href*="github.com/intactdots/wikiweigher"]'),
  changelog: document.getElementById('ab-changelog').textContent.slice(0, 80)
}));
ok('#about hash opens About pane', about.visible);
ok('About shows version', about.version === 'v' + VERSION, `${about.version} vs manifest ${VERSION}`);
ok('About rate link -> store reviews', about.rateHref.includes('chromewebstore.google.com') && about.rateHref.endsWith('/reviews'), about.rateHref.slice(0, 70));
ok('About has the Intactdots brand block + GitHub', about.brand && about.github);
ok('About renders packaged changelog', about.changelog.includes(VERSION), about.changelog.slice(0, 50));
await opt.close();

const pop = await browser.newPage();
await pop.goto(`chrome-extension://${ID}/src/popup/popup.html`, { waitUntil: 'networkidle0' });
const pf = await pop.evaluate(() => ({
  about: !!document.getElementById('about'),
  noSponsor: !document.querySelector('.psponsor')
}));
ok('popup footer has About and no sponsor link', pf.about && pf.noSponsor);
await pop.evaluate(() => document.getElementById('about').click());
await new Promise(r => setTimeout(r, 1500));
const aboutTab = (await browser.targets()).find(t => t.url().includes('options.html#about'));
ok('popup About opens options#about', !!aboutTab, aboutTab ? 'opened' : 'no tab');

await browser.close();
const fails = results.filter(r => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
if (fails.length) { console.log('FAILURES:'); fails.forEach(f => console.log('  - ' + f.name + (f.note ? ' | ' + f.note : ''))); process.exit(1); }
