import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const ROOT = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const EXT = process.env.EXT || ROOT + '/.package/wikiweigher-' + JSON.parse(readFileSync(ROOT + '/manifest.json', 'utf8')).version;
const OUT = process.env.OUT || ROOT + '/src/welcome/shots';
const DPR = Number(process.env.DPR || 2);
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: false,
  protocolTimeout: 400000,
  args: [
    `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1400,1000',
    '--disable-features=MemorySaver', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  ],
});

const idp = await browser.newPage();
await idp.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
const ID = await idp.evaluate(() => new Promise(r => chrome.developerPrivate.getExtensionsInfo(l => r(l[0]?.id))));
await idp.close();
console.log('id', ID, '| dpr', DPR);

const pause = ms => new Promise(r => setTimeout(r, ms));

async function setTheme(theme) {
  const p = await browser.newPage();
  await p.goto(`chrome-extension://${ID}/src/options/options.html`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(t => new Promise(r => {
    chrome.storage.local.get('settings', o => {
      const s = o.settings || {};
      s.theme = t;
      chrome.storage.local.set({ settings: s }, r);
    });
  }), theme);
  await p.close();
}

const READY = () => {
  for (const el of document.body.querySelectorAll('*')) {
    const sr = el.shadowRoot;
    if (!sr || !sr.querySelector('.cx-card')) continue;
    const rows = sr.querySelector('.cx-rows');
    const foot = sr.querySelector('.cx-foot');
    if (!rows || !rows.textContent.trim() || rows.textContent.includes('~')) return false;
    if (foot && /sharpen|estimat|Ranking/i.test(foot.textContent)) return false;
    return true;
  }
  return false;
};

async function clip(page, file, sel = '.cx-card') {
  const box = await page.evaluate(s => {
    for (const el of document.body.querySelectorAll('*')) {
      const card = el.shadowRoot && el.shadowRoot.querySelector(s);
      if (card) {
        const b = card.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }
    }
    return null;
  }, sel);
  if (!box || box.width < 30) { console.log('  ! no ' + sel + ' for ' + file); return; }
  await page.screenshot({
    path: `${OUT}/${file}.png`,
    clip: { ...box, scale: 1 },
    captureBeyondViewport: false,
  });
  console.log(`  ${file}.png  ${Math.round(box.width)}x${Math.round(box.height)} css @${DPR}x`);
}

async function article(url, base, { pill = false } = {}) {
  await setTheme('dark');
  const page = await browser.newPage();
  await page.setViewport({ width: 1340, height: 980, deviceScaleFactor: DPR });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(READY, { polling: 1000, timeout: 280000 });
    await pause(2200);
    await clip(page, `${base}-dark`);

    await setTheme('light');
    await pause(2200);
    await clip(page, `${base}-light`);

    if (pill) {
      await setTheme('dark');
      await pause(1600);
      await page.evaluate(() => {
        for (const el of document.body.querySelectorAll('*')) {
          const b = el.shadowRoot && el.shadowRoot.querySelector('[data-act="min"],.cx-min,[title*="inim" i]');
          if (b) { b.click(); return; }
        }
      });
      await pause(1400);
      await clip(page, `${base}-pill-dark`, '.cx-pill');
    }
  } catch (e) {
    console.log(`  ! ${base}: ${String(e).slice(0, 100)}`);
  }
  await page.close();
  await pause(7000);
}

async function extPage(path, base, width, height) {
  for (const theme of ['dark', 'light']) {
    await setTheme(theme);
    const p = await browser.newPage();
    await p.setViewport({ width, height, deviceScaleFactor: DPR });
    try {
      await p.goto(`chrome-extension://${ID}/${path}`, { waitUntil: 'networkidle0' });
      await pause(1500);
      await p.screenshot({ path: `${OUT}/${base}-${theme}.png` });
      console.log(`  ${base}-${theme}.png  ${width}x${height} css @${DPR}x`);
    } catch (e) { console.log(`  ! ${base}: ${String(e).slice(0, 80)}`); }
    await p.close();
  }
}

const JOBS = {
  switch: () => article('https://en.wikipedia.org/wiki/Photosynthesis', 'card-switch', { pill: true }),
  stay: () => article('https://en.wikipedia.org/wiki/Mount_Everest', 'card-stay'),
  rtl: () => article('https://ar.wikipedia.org/wiki/%D8%A7%D9%84%D9%82%D8%A7%D9%87%D8%B1%D8%A9', 'card-rtl'),
  popup: () => extPage('src/popup/popup.html', 'popup', 320, 430),
  options: () => extPage('src/options/options.html', 'options', 980, 640),
};

const only = (process.env.ONLY || Object.keys(JOBS).join(',')).split(',').map(s => s.trim());
for (const name of only) {
  if (!JOBS[name]) { console.log(`  ? unknown job ${name}`); continue; }
  console.log(`\n${name}`);
  await JOBS[name]();
}

await setTheme('auto');
await browser.close();
console.log('\ndone ->', OUT);
