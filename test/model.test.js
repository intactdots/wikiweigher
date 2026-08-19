import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../src/core/model.js';

function stateWith(analyzedCount, estimatedCount, analyzeSetting) {
  const langs = [];
  const exact = {};
  const sizes = {};
  for (let i = 0; i < analyzedCount; i++) {
    const lang = 'a' + i;
    langs.push({ lang });
    exact[lang] = { words: 5000 - i * 50, refs: 200 - i, sections: 10, images: 5 };
  }
  for (let i = 0; i < estimatedCount; i++) {
    const lang = 'e' + i;
    langs.push({ lang });
    sizes[lang] = 40000 - i * 100;
  }
  return {
    current: 'a0', uiLang: 'a0', settings: { weight: 0.5, analyze: analyzeSetting }, minimized: false,
    langs, sizes, exact, state: 'ready', total: analyzedCount + estimatedCount
  };
}

test('analyze=6 shows exactly 6 rows, no padding with estimated languages', () => {
  const model = buildModel(stateWith(6, 30, 6));
  assert.equal(model.ranked.length, 6);
  assert.equal(model.ranked.filter(r => r.estimated).length, 0, 'no estimated filler rows');
});

test('analyze=12 (default) shows exactly 12 rows when 12 are analyzed', () => {
  const model = buildModel(stateWith(12, 30, 12));
  assert.equal(model.ranked.length, 12);
});

test('analyze=24 shows exactly 24 rows when 24 are analyzed', () => {
  const model = buildModel(stateWith(24, 30, 24));
  assert.equal(model.ranked.length, 24);
});

test('never shows more rows than were actually analyzed, even if the setting asks for more', () => {
  const model = buildModel(stateWith(8, 30, 24));
  assert.equal(model.ranked.length, 8, 'only 8 were analyzed, so only 8 can be shown');
});

test('the current language is always present in the rows', () => {
  const model = buildModel(stateWith(6, 30, 6));
  assert.ok(model.ranked.some(r => r.lang === 'a0'), 'current lang a0 must be in rows');
});

test('best and bestSourced are computed from analyzed languages', () => {
  const model = buildModel(stateWith(24, 30, 24));
  assert.ok(model.best);
  assert.ok(model.bestSourced);
  assert.equal(model.bestSourced.lang, 'a0', 'a0 has the most refs (200)');
});

test('the loading/estimated phase respects the same cap for a consistent row count', () => {
  const state = stateWith(0, 30, 6);
  const model = buildModel({ ...state, state: 'estimated' });
  assert.equal(model.ranked.length, 6);
});
