import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getLanguages } from '../src/core/languageIndex.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/langlinks-en.json', import.meta.url), 'utf8'));

test('getLanguages puts the current language first', async () => {
  const langs = await getLanguages('en', 'Mount Everest', { fetchJson: async () => fixture });
  assert.equal(langs[0].lang, 'en');
  assert.equal(langs[0].title, 'Mount Everest');
});

test('getLanguages parses langlinks into lang and title pairs', async () => {
  const langs = await getLanguages('en', 'Mount Everest', { fetchJson: async () => fixture });
  assert.deepEqual(langs.map(l => l.lang), ['en', 'de', 'fr', 'ja']);
  assert.equal(langs.find(l => l.lang === 'fr').title, 'Everest');
});

test('getLanguages returns only the current language when there are no langlinks', async () => {
  const langs = await getLanguages('en', 'Some Stub', { fetchJson: async () => ({ query: { pages: { 1: { title: 'Some Stub' } } } }) });
  assert.deepEqual(langs, [{ lang: 'en', title: 'Some Stub', site: 'en.wikipedia.org' }]);
});

test('a failed lookup is null, not a lonely current language', async () => {
  assert.equal(await getLanguages('en', 'Mount Everest', { fetchJson: async () => null }), null);
});

test('a genuine one-language article is distinguishable from a failed lookup', async () => {
  const stub = await getLanguages('en', 'Some Stub', { fetchJson: async () => ({ query: { pages: { 1: { title: 'Some Stub' } } } }) });
  const failed = await getLanguages('en', 'Some Stub', { fetchJson: async () => null });
  assert.equal(Array.isArray(stub) && stub.length, 1);
  assert.equal(failed, null);
});
