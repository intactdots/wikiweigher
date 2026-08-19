import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const EXT = process.env.EXT || ROOT + '/.package/wikiweigher-' + JSON.parse(readFileSync(ROOT + '/manifest.json', 'utf8')).version;
const OUT = process.env.OUT || ROOT + '/.artifacts';

const b = await puppeteer.launch({
  headless: false, protocolTimeout: 90000,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
    '--no-first-run', '--window-size=1200,900', '--disable-features=MemorySaver'],
});
const idp = await b.newPage();
await idp.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
const ID = await idp.evaluate(() => new Promise(r => chrome.developerPrivate.getExtensionsInfo(l => r(l[0]?.id))));
await idp.close();

for (const [page, base, w, h] of [
  ['src/options/options.html#about', 'about', 980, 760],
  ['src/popup/popup.html', 'popupfoot', 320, 430],
]) {
  for (const theme of ['light', 'dark']) {
    const t = await b.newPage();
    await t.goto(`chrome-extension://${ID}/src/options/options.html`, { waitUntil: 'domcontentloaded' });
    await t.evaluate(x => new Promise(r => chrome.storage.local.get('settings', o => {
      const s = o.settings || {}; s.theme = x; chrome.storage.local.set({ settings: s }, r);
    })), theme);
    await t.close();

    const p = await b.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
    await p.goto(`chrome-extension://${ID}/${page}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1400));
    await p.screenshot({ path: `${OUT}/${base}-${theme}.png` });
    console.log(`  ${base}-${theme}.png`);
    await p.close();
  }
}
await b.close();
console.log('done');
