import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { readFileSync } from 'node:fs';
import { getExact, getQuickSize } from '../src/core/depthAnalyzer.js';

const html = readFileSync(new URL('./fixtures/article-en.html', import.meta.url), 'utf8');
const parse = h => new DOMParser().parseFromString(h, 'text/html');

test('getExact computes words and refs from fetched html', async () => {
  const fetchJson = async () => ({ parse: { text: { '*': html } } });
  const r = await getExact('en.wikipedia.org', 'Mount Everest', { fetchJson, parse });
  assert.ok(r.words > 5);
  assert.equal(r.refs, 3);
});

test('getExact returns null when html is missing', async () => {
  const r = await getExact('en.wikipedia.org', 'X', { fetchJson: async () => ({}), parse });
  assert.equal(r, null);
});

test('getQuickSize reads page length', async () => {
  const fetchJson = async () => ({ query: { pages: { 1: { length: 4321 } } } });
  const size = await getQuickSize('en.wikipedia.org', 'X', { fetchJson });
  assert.equal(size, 4321);
});
