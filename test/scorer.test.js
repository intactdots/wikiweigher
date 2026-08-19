import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score } from '../src/core/scorer.js';

const data = [
  { lang: 'en', words: 7297, refs: 115 },
  { lang: 'de', words: 10977, refs: 108 },
  { lang: 'ja', words: 10068, refs: 28 }
];

test('balanced 0.5 ranks de top and is sorted', () => {
  const r = score(data, { weight: 0.5, currentLang: 'en' });
  assert.equal(r.best.lang, 'de');
  assert.ok(r.ranked[0].score >= r.ranked[1].score);
  assert.ok(r.ranked[1].score >= r.ranked[2].score);
});

test('best sourced is max refs regardless of weight', () => {
  const r = score(data, { weight: 0.5, currentLang: 'en' });
  assert.equal(r.bestSourced.lang, 'en');
});

test('weight 0 follows references only', () => {
  const r = score(data, { weight: 0, currentLang: 'en' });
  assert.equal(r.best.lang, 'en');
});

test('verdict switch when best beats current by margin', () => {
  const r = score(data, { weight: 1, currentLang: 'en' });
  assert.equal(r.best.lang, 'de');
  assert.equal(r.verdict.type, 'switch');
  assert.equal(r.verdict.target, 'de');
});

test('verdict stay when current is best', () => {
  const r = score(data, { weight: 0, currentLang: 'en' });
  assert.equal(r.verdict.type, 'stay');
});

test('verdict stay when lead is under margin', () => {
  const close = [
    { lang: 'en', words: 1000, refs: 100 },
    { lang: 'fr', words: 1020, refs: 101 }
  ];
  const r = score(close, { weight: 0.5, currentLang: 'en', margin: 0.1 });
  assert.equal(r.verdict.type, 'stay');
});

test('single language stays', () => {
  const r = score([{ lang: 'en', words: 5, refs: 1 }], { weight: 0.5, currentLang: 'en' });
  assert.equal(r.verdict.type, 'stay');
});

test('ranking uses calibrated depth when provided, not raw words', () => {
  const langs = [
    { lang: 'a', words: 1000, refs: 10, depth: 1000 },
    { lang: 'b', words: 1200, refs: 10, depth: 800 }
  ];
  const r = score(langs, { weight: 1, currentLang: 'a' });
  assert.equal(r.best.lang, 'a');
});

test('a featured badge wins an otherwise exact tie', () => {
  const langs = [
    { lang: 'a', words: 1000, refs: 100 },
    { lang: 'b', words: 1000, refs: 100, badge: 'featured' }
  ];
  const r = score(langs, { weight: 0.5, currentLang: 'a' });
  assert.equal(r.best.lang, 'b');
});

test('a featured badge ranks an otherwise-equal alternative first', () => {
  const langs = [
    { lang: 'en', words: 1000, refs: 100 },
    { lang: 'de', words: 1000, refs: 100, badge: 'featured' }
  ];
  const r = score(langs, { weight: 0.5, currentLang: 'en' });
  assert.equal(r.best.lang, 'de');
});

test('more structure breaks a tie', () => {
  const langs = [
    { lang: 'a', words: 1000, refs: 100, sections: 5, images: 2 },
    { lang: 'b', words: 1000, refs: 100, sections: 20, images: 10 }
  ];
  const r = score(langs, { weight: 0.5, currentLang: 'a' });
  assert.equal(r.best.lang, 'b');
});

test('a featured badge does not override a clearly bigger, better-sourced article', () => {
  const langs = [
    { lang: 'en', words: 14000, refs: 356 },
    { lang: 'az', words: 10000, refs: 328, badge: 'featured' },
    { lang: 'ja', words: 17000, refs: 100 }
  ];
  const r = score(langs, { weight: 0.5, currentLang: 'en' });
  assert.equal(r.best.lang, 'en');
});

test('verdict exposes a per-dimension gain breakdown so the card can explain why', () => {
  const langs = [
    { lang: 'ar', words: 9000, refs: 177 },
    { lang: 'en', words: 10000, refs: 313 }
  ];
  const r = score(langs, { weight: 0.5, currentLang: 'ar' });
  assert.equal(r.verdict.type, 'switch');
  assert.ok(r.verdict.drivers, 'verdict must carry a drivers breakdown');
  assert.ok('depth' in r.verdict.drivers && 'refs' in r.verdict.drivers && 'quality' in r.verdict.drivers);
});

test('the reference gain dominates when the winner is far better sourced', () => {
  const langs = [
    { lang: 'ar', words: 9000, refs: 177 },
    { lang: 'en', words: 10000, refs: 313 }
  ];
  const r = score(langs, { weight: 0.5, currentLang: 'ar' });
  assert.ok(r.verdict.drivers.refs > r.verdict.drivers.depth, 'refs jumped 177->313, depth barely moved');
});

test('a quality badge is named as the driver when it flips the verdict', () => {
  const langs = [
    { lang: 'en', words: 1000, refs: 100 },
    { lang: 'de', words: 1000, refs: 100, badge: 'featured' }
  ];
  const r = score(langs, { weight: 0.5, currentLang: 'en' });
  assert.equal(r.best.lang, 'de');
  assert.ok(r.verdict.drivers.quality > 0, 'quality drove this flip');
});
