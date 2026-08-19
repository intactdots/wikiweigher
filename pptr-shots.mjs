import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
import puppeteer from 'puppeteer';

const EXT = ROOT;
const OUT = ROOT + '/store/screenshots';

const browser = await puppeteer.launch({
  headless: false,
  protocolTimeout: 300000,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check', '--window-size=1320,900', '--disable-features=MemorySaver', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
});

const ext = await browser.newPage();
await ext.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
const ID = await ext.evaluate(() => new Promise(res => chrome.developerPrivate.getExtensionsInfo(list => res(list[0]?.id))));
await ext.close();

const ONLY = process.env.SHOT || '';

async function shot(name, url, opts = {}) {
  if (ONLY && !name.includes(ONLY)) return;
  await new Promise(r => setTimeout(r, 4000));
  try { await shotOnce(name, url, opts); }
  catch (e) { console.log('retry ' + name + ' after: ' + String(e).slice(0, 80)); await new Promise(r => setTimeout(r, 8000)); await shotOnce(name, url, opts); }
}

async function shotOnce(name, url, { scheme = 'light', pre = null, post = null } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  if (pre) await pre(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (url.includes('wikipedia.org/wiki')) {
    let done = false;
    for (let i = 0; i < 4 && !done; i++) {
      done = await page.waitForFunction(() => document.documentElement.dataset.wikiweigherStatus === 'ready', { timeout: 60000, polling: 1000 }).then(() => true).catch(() => false);
      if (!done) await new Promise(r => setTimeout(r, 4000));
    }
    if (!done) throw new Error('never ready: ' + url);
  }
  if (post) await post(page);
  await page.bringToFront();
  await new Promise(r => setTimeout(r, 1800));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('saved ' + name);
  await page.close().catch(() => {});
}

await shot('1-best-overall', 'https://en.wikipedia.org/wiki/Chernobyl_disaster');
await shot('2-best-sourced', 'https://en.wikipedia.org/wiki/Astatine');

const setTheme = theme => async page => {
  const p2 = await browser.newPage();
  await p2.goto(`chrome-extension://${ID}/src/options/options.html`, { waitUntil: 'domcontentloaded' });
  await p2.evaluate(async t => {
    const { setSettings } = await import('../settings/settings.js');
    await setSettings({ theme: t }, chrome.storage.local);
  }, theme);
  await p2.close();
};

await shot('4-dark-theme', 'https://en.wikipedia.org/wiki/Mount_Everest', { scheme: 'dark', pre: setTheme('dark') });
await shot('5-japanese', 'https://ja.wikipedia.org/wiki/%E4%BA%AC%E9%83%BD%E5%B8%82', { pre: setTheme('light') });
await shot('3-diagnostics', `chrome-extension://${ID}/src/options/options.html#diag`, {
  post: async page => { await page.evaluate(() => new Promise(r => setTimeout(r, 600))); }
});

const p3 = await browser.newPage();
await p3.goto(`chrome-extension://${ID}/src/options/options.html`, { waitUntil: 'domcontentloaded' });
await p3.evaluate(async () => {
  const { setSettings } = await import('../settings/settings.js');
  await setSettings({ theme: 'auto' }, chrome.storage.local);
});
await p3.close();

await browser.close();
console.log('DONE');
