import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync } from 'node:fs';

const SVG = readFileSync(new URL('./icons/logo.svg', import.meta.url), 'utf8');
const SIZES = [16, 48, 128];

const browser = await puppeteer.launch({ headless: true });

for (const size of SIZES) {
  const page = await browser.newPage();
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><style>*{margin:0;padding:0}html,body{width:${size}px;height:${size}px}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${SVG}</body></html>`);
  await new Promise(r => setTimeout(r, 120));
  const buf = await page.screenshot({ omitBackground: true });
  writeFileSync(new URL(`./icons/icon${size}.png`, import.meta.url), buf);
  await page.close();
}

await browser.close();
console.log('icons written from icons/logo.svg at', SIZES.join(', '));
