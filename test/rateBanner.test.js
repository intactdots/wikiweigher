import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { buildCard } from '../src/ui/card.js';

const { document } = parseHTML('<!doctype html><html><body></body></html>');

function model(extra = {}) {
  return {
    state: 'ready',
    current: 'en',
    ranked: [{ lang: 'en', words: 7297, refs: 115, score: 1 }],
    best: { lang: 'en', words: 7297, refs: 115 },
    verdict: { type: 'stay', target: 'en' },
    settings: { languagesIRead: ['en'] },
    total: 20,
    ...extra
  };
}

test('rate banner absent by default', () => {
  const card = buildCard(document, model());
  assert.equal(card.querySelector('.cx-rate'), null);
});

test('rate banner renders with actions when ratePrompt set', () => {
  const card = buildCard(document, model({ ratePrompt: true }));
  const banner = card.querySelector('.cx-rate');
  assert.ok(banner);
  assert.ok(card.querySelector('[data-act="rate"]'));
  assert.ok(card.querySelector('[data-act="rate-later"]'));
  assert.ok(card.querySelector('[data-act="rate-never"]'));
  assert.match(banner.textContent, /Enjoying Wikiweigher/);
});

test('rate banner not shown while loading or minimized', () => {
  assert.equal(buildCard(document, model({ ratePrompt: true, state: 'estimated' })).querySelector('.cx-rate'), null);
  const pill = buildCard(document, model({ ratePrompt: true, minimized: true }));
  assert.ok(pill.classList.contains('cx-pill'));
});
