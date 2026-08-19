import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
import puppeteer from 'puppeteer';

const EXT = process.env.EXT || ROOT;

const browser = await puppeteer.launch({
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check']
});

const ext = await browser.newPage();
await ext.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
const ID = await ext.evaluate(() => new Promise(res => chrome.developerPrivate.getExtensionsInfo(list => res(list[0]?.id))));
await ext.close();

let bad = 0;
for (const rel of ['src/popup/popup.html', 'src/options/options.html']) {
  const p = await browser.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message || e)));
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await p.goto(`chrome-extension://${ID}/${rel}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 900));
  const info = await p.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    controls: document.querySelectorAll('button, input, select').length
  }));
  const pass = errs.length === 0 && info.controls > 3 && info.bg === 'rgb(1, 1, 2)';
  if (!pass) bad++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${rel} | bg=${info.bg} controls=${info.controls}${errs.length ? ' | ERR ' + errs.join(';') : ''}`);
  await p.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
