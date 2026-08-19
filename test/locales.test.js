import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const catalogue = JSON.parse(read('_locales/en/messages.json'));

const MARKUP = ['src/options/options.html', 'src/popup/popup.html', 'src/welcome/welcome.html'];
const SCRIPTS = ['src/options/options.js', 'src/popup/popup.js', 'src/welcome/welcome.js'];

function keysInMarkup(src) {
  const keys = [];
  for (const m of src.matchAll(/data-i18n="([^"]+)"/g)) keys.push(m[1]);
  for (const m of src.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of m[1].split(',')) keys.push(pair.split(':')[1]);
  }
  return keys;
}

test('every key referenced in markup exists in the catalogue', () => {
  for (const file of MARKUP) {
    for (const key of keysInMarkup(read(file))) {
      assert.ok(catalogue[key], `${file} references missing message "${key}"`);
    }
  }
});

test('every key referenced from script exists in the catalogue', () => {
  for (const file of SCRIPTS) {
    for (const m of read(file).matchAll(/\bmsg\('([^']+)'\)/g)) {
      assert.ok(catalogue[m[1]], `${file} references missing message "${m[1]}"`);
    }
  }
});

test('the manifest placeholders resolve', () => {
  const raw = read('manifest.json');
  const manifest = JSON.parse(raw);
  assert.equal(manifest.default_locale, 'en');
  for (const field of ['name', 'description']) {
    assert.ok(/^__MSG_(.+)__$/.test(manifest[field]), `manifest.${field} is not a message placeholder`);
  }
  const placeholders = [...raw.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)].map(m => m[1]);
  assert.ok(placeholders.length >= 4, `expected the manifest to be localised, found ${placeholders.length} placeholders`);
  for (const key of placeholders) {
    assert.ok(catalogue[key], `manifest points at missing message "${key}"`);
  }
});

test('the store description stays inside the Chrome Web Store limit', () => {
  assert.ok(catalogue.extDesc.message.length <= 132, `description is ${catalogue.extDesc.message.length} characters`);
});

test('every catalogue entry is actually used somewhere', () => {
  const used = new Set();
  for (const file of MARKUP) for (const key of keysInMarkup(read(file))) used.add(key);
  for (const file of SCRIPTS) for (const m of read(file).matchAll(/\bmsg\('([^']+)'\)/g)) used.add(m[1]);
  for (const m of read('manifest.json').matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) used.add(m[1]);
  const orphans = Object.keys(catalogue).filter(k => !used.has(k));
  assert.deepEqual(orphans, [], 'unused messages should be removed');
});

test('every message entry has the shape Chrome requires', () => {
  for (const [key, entry] of Object.entries(catalogue)) {
    assert.equal(typeof entry, 'object', key + ' is not an object');
    assert.equal(typeof entry.message, 'string', key + ' has no message string');
    assert.ok(entry.message.length > 0, key + ' is empty');
  }
});

test('any translation added later covers only known keys', () => {
  const dir = new URL('_locales/', root);
  for (const locale of readdirSync(dir)) {
    if (locale === 'en') continue;
    const file = new URL(`${locale}/messages.json`, dir);
    if (!existsSync(file)) continue;
    const translated = JSON.parse(readFileSync(file, 'utf8'));
    for (const key of Object.keys(translated)) {
      assert.ok(catalogue[key], `_locales/${locale} defines unknown message "${key}"`);
    }
  }
});
