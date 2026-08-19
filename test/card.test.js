import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { buildCard } from '../src/ui/card.js';

const { document } = parseHTML('<!doctype html><html><body></body></html>');

const model = {
  state: 'ready',
  current: 'en',
  ranked: [
    { lang: 'de', words: 10977, refs: 108, score: 0.96 },
    { lang: 'en', words: 7297, refs: 115, score: 0.5 },
    { lang: 'ja', words: 10068, refs: 28, score: 0.38 }
  ],
  best: { lang: 'de', words: 10977, refs: 108, score: 0.96 },
  bestSourced: { lang: 'en', words: 7297, refs: 115 },
  verdict: { type: 'switch', target: 'de', deltaPct: 50 },
  settings: { languagesIRead: ['en'] },
  minimized: false
};

test('ready card renders best block, every row, and controls', () => {
  const card = buildCard(document, model, {});
  assert.ok(card.querySelector('.cx-best'));
  assert.equal(card.querySelectorAll('.cx-row').length, 3);
  assert.ok(card.querySelector('[data-act="min"]'));
  assert.ok(card.querySelector('[data-act="close"]'));
  assert.ok(card.querySelector('[data-act="open"]'));
});

test('best block names the winning language', () => {
  const card = buildCard(document, model, {});
  assert.match(card.querySelector('.cx-best-name').textContent, /Deutsch/);
});

test('card renders in the override ui language, not the article language', () => {
  const m = { ...model, uiLang: 'de' };
  const card = buildCard(document, m, {});
  assert.match(card.querySelector('.cx-best-label').textContent, /Insgesamt/);
});

test('minimized renders a pill, not the full card', () => {
  const card = buildCard(document, { ...model, minimized: true }, {});
  assert.ok(card.classList.contains('cx-pill'));
  assert.equal(card.querySelector('.cx-rows'), null);
});

test('a stay verdict keeps you where you are and offers nothing to open', () => {
  const stay = { ...model, verdict: { type: 'stay', target: 'de', deltaPct: 4 } };
  const card = buildCard(document, stay, {});
  assert.ok(card.querySelector('.cx-best'));
  assert.match(card.querySelector('.cx-best-name').textContent, /English/);
  assert.equal(!!card.querySelector('.cx-open'), false, 'no Open button in the hero');
  assert.equal(!!card.querySelector('.cx-you'), true, 'the here tag is shown');
});

test('a switch verdict names the winner and offers to open it', () => {
  const card = buildCard(document, model, {});
  assert.match(card.querySelector('.cx-best-name').textContent, /Deutsch/);
  assert.equal(!!card.querySelector('.cx-open'), true, 'the hero offers to open the winner');
});

test('the ranking still shows the higher scoring language while you stay', () => {
  const stay = { ...model, verdict: { type: 'stay', target: 'de', deltaPct: 4 } };
  const card = buildCard(document, stay, {});
  const rows = [...card.querySelectorAll('.cx-row')].map(r => r.textContent);
  assert.equal(rows.length, 3);
  assert.match(rows[0], /Deutsch/);
});

test('when the current language is the best, it is named and marked as yours', () => {
  const m = {
    ...model,
    best: { lang: 'en', words: 7297, refs: 115, score: 0.96 },
    ranked: [
      { lang: 'en', words: 7297, refs: 115, score: 0.96 },
      { lang: 'de', words: 10977, refs: 108, score: 0.5 }
    ],
    verdict: { type: 'stay', target: 'en', deltaPct: 0 }
  };
  const card = buildCard(document, m, {});
  assert.match(card.querySelector('.cx-best-name').textContent, /English/);
  assert.ok(card.querySelector('.cx-you'));
});

const switchModel = {
  state: 'ready', current: 'ar',
  ranked: [
    { lang: 'en', words: 10000, refs: 313, score: 0.98 },
    { lang: 'ar', words: 9000, refs: 177, score: 0.71 }
  ],
  best: { lang: 'en', words: 10000, refs: 313, score: 0.98 },
  bestSourced: { lang: 'en', words: 10000, refs: 313 },
  verdict: { type: 'switch', target: 'en', deltaPct: 27, drivers: { depth: 0.055, refs: 0.38, quality: 0 } },
  settings: { languagesIRead: ['ar'] }, minimized: false, uiLang: 'en'
};

test('the reason shows the pick\'s own words and references, both, never a comparison or percentage', () => {
  const card = buildCard(document, switchModel, {});
  const reason = card.querySelector('.cx-best-reason').textContent;
  assert.doesNotMatch(reason, /%/, 'no synthetic percentage');
  assert.doesNotMatch(reason, /\bvs\b/, 'no vs comparison');
  assert.match(reason, /10k/, 'shows the pick word count');
  assert.match(reason, /313/, 'shows the pick reference count');
  assert.match(reason, /word/i);
});

test('the reason reports both dimensions for a depth-strong pick', () => {
  const m = {
    ...switchModel, current: 'en',
    ranked: [
      { lang: 'de', words: 14000, refs: 208, score: 0.98 },
      { lang: 'en', words: 7000, refs: 100, score: 0.6 }
    ],
    best: { lang: 'de', words: 14000, refs: 208, score: 0.98 },
    bestSourced: { lang: 'de', words: 14000, refs: 208 },
    verdict: { type: 'switch', target: 'de', deltaPct: 50, drivers: { depth: 0.5, refs: 0, quality: 0 } }
  };
  const reason = buildCard(document, m, {}).querySelector('.cx-best-reason').textContent;
  assert.match(reason, /14k/);
  assert.match(reason, /208/);
  assert.match(reason, /word/i);
});

test('a featured pick still shows a star badge next to the name', () => {
  const m = {
    ...switchModel, current: 'en',
    ranked: [
      { lang: 'de', words: 1000, refs: 100, score: 0.98, badge: 'featured' },
      { lang: 'en', words: 1000, refs: 100, score: 0.9 }
    ],
    best: { lang: 'de', words: 1000, refs: 100, score: 0.98, badge: 'featured' },
    bestSourced: { lang: 'de', words: 1000, refs: 100, badge: 'featured' },
    verdict: { type: 'switch', target: 'de', deltaPct: 5, drivers: { depth: 0, refs: 0, quality: 0.05 } }
  };
  const card = buildCard(document, m, {});
  assert.ok(card.querySelector('.cx-best .cx-badge'), 'featured star badge present by the name');
  assert.match(card.querySelector('.cx-best-reason').textContent, /100/, 'reason shows its refs');
});

test('best sourced is surfaced when a different language has more references', () => {
  const m = {
    state: 'ready', current: 'tr',
    ranked: [
      { lang: 'tr', words: 4500, refs: 146, score: 0.96 },
      { lang: 'fr', words: 5200, refs: 174, score: 0.9 }
    ],
    best: { lang: 'tr', words: 4500, refs: 146, score: 0.96 },
    bestSourced: { lang: 'fr', words: 5200, refs: 174 },
    verdict: { type: 'stay', target: 'tr', deltaPct: 0, drivers: { depth: 0, refs: 0, quality: 0 } },
    settings: { languagesIRead: ['tr'] }, minimized: false, uiLang: 'en'
  };
  const card = buildCard(document, m, {});
  const sourced = card.querySelector('.cx-sourced');
  assert.ok(sourced, 'best-sourced line must be present');
  assert.match(sourced.textContent, /fran/i, 'names the source winner (français)');
  assert.match(sourced.textContent, /174/, 'shows its reference count');
  const link = sourced.querySelector('[data-act="open"]');
  assert.ok(link && link.getAttribute('data-lang') === 'fr', 'source winner is clickable to open');
});

test('best sourced is hidden when the best overall is already the best sourced', () => {
  const card = buildCard(document, switchModel, {});
  assert.equal(card.querySelector('.cx-sourced'), null, 'no redundant best-sourced line');
});

test('best sourced still shows when the CURRENT language is the overall best but a different language has more refs', () => {
  const m = {
    state: 'ready', current: 'en',
    ranked: [
      { lang: 'en', words: 9000, refs: 300, score: 0.95 },
      { lang: 'fr', words: 4000, refs: 450, score: 0.7 }
    ],
    best: { lang: 'en', words: 9000, refs: 300, score: 0.95 },
    bestSourced: { lang: 'fr', words: 4000, refs: 450 },
    verdict: { type: 'stay', target: 'en', deltaPct: 0, drivers: { depth: 0, refs: 0, quality: 0 } },
    settings: { languagesIRead: ['en'] }, minimized: false, uiLang: 'en'
  };
  const card = buildCard(document, m, {});
  assert.ok(card.querySelector('.cx-you'), 'current-is-best still marked as yours');
  const sourced = card.querySelector('.cx-sourced');
  assert.ok(sourced, 'best-sourced line must still appear even when current is the overall best');
  assert.match(sourced.textContent, /fran/i);
  assert.match(sourced.textContent, /450/);
});
