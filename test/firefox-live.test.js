import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ext = join(root, 'firefox');
const binary = process.env.FIREFOX_BIN || 'C:/Program Files (x86)/Mozilla Firefox/firefox.exe';
const ARTICLE = 'https://en.wikipedia.org/wiki/Chernobyl_disaster';

const ready = existsSync(ext) && existsSync(binary);

test('the firefox port ranks a live article in firefox', { skip: ready ? false : 'run npm run build:firefox, and set FIREFOX_BIN', timeout: 300000 }, async () => {
  const browser = await puppeteer.launch({ browser: 'firefox', executablePath: binary, headless: true });
  try {
    const id = await browser.installExtension(ext);
    assert.equal(id, 'wikiweigher@intactdots.com');

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(ARTICLE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#wikiweigher-host', { timeout: 60000 });

    const rows = await page.waitForFunction(() => {
      const root = document.getElementById('wikiweigher-host')?.shadowRoot;
      if (!root) return false;
      const text = [...root.querySelectorAll('*')]
        .filter(n => n.children.length === 0)
        .map(n => n.textContent.trim())
        .join(' | ');
      return /\d+k\s*[·.]\s*\d+/.test(text) ? text : false;
    }, { timeout: 180000, polling: 1000 }).then(h => h.jsonValue());

    assert.match(rows, /fran\u00e7ais/, 'the french row should be measured');
    assert.match(rows, /\d+k\s*[·.]\s*\d+/, 'rows should carry word and reference counts');
    assert.deepEqual(errors, [], 'the content script threw');
  } finally {
    await browser.close().catch(() => {});
  }
});
