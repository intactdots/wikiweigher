import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { getLanguages } from '../src/core/languageIndex.js';
import { getExact, getQuickSize } from '../src/core/depthAnalyzer.js';

const parse = h => new DOMParser().parseFromString(h, 'text/html');

const wanted = !!process.env.LIVE;

const online = wanted && await (async () => {
  try {
    const r = await fetch('https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*', { signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch {
    return false;
  }
})();

const skip = !wanted ? 'set LIVE=1 to run tests that reach Wikipedia' : (online ? false : 'offline');

test('live: getLanguages returns many languages for Photosynthesis', { skip }, async () => {
  const langs = await getLanguages('en', 'Photosynthesis');
  assert.ok(langs.length >= 10, `expected >=10 langs, got ${langs.length}`);
  assert.equal(langs[0].lang, 'en');
});

test('live: getQuickSize returns a positive byte length', { skip }, async () => {
  const size = await getQuickSize('en.wikipedia.org', 'Photosynthesis');
  assert.ok(size > 1000, `expected >1000 bytes, got ${size}`);
});

test('live: getExact returns real prose words and references', { skip }, async () => {
  const r = await getExact('en.wikipedia.org', 'Photosynthesis', { parse });
  assert.ok(r && r.words > 2000, `expected >2000 words, got ${r && r.words}`);
  assert.ok(r.refs > 50, `expected >50 refs, got ${r && r.refs}`);
});
