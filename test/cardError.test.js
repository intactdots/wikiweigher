import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { buildCard } from '../src/ui/card.js';
import { LANGS } from '../src/ui/i18n.js';
import { t } from '../src/ui/i18n.js';

const { document } = parseHTML('<!doctype html><html><body></body></html>');

const errorModel = {
  state: 'error',
  current: 'en',
  error: { kind: 'network' },
  ranked: [],
  best: null,
  bestSourced: null,
  verdict: null,
  settings: { languagesIRead: ['en'] },
  minimized: false
};

test('an error card explains the failure and offers a way out', () => {
  const card = buildCard(document, errorModel, {});
  assert.ok(card.querySelector('.cx-error'), 'no error block');
  assert.ok(card.querySelector('[data-act="retry"]'), 'no retry control');
  assert.ok(card.querySelector('[data-act="report"]'), 'no report control');
});

test('an error card never renders a spinner or stale rows', () => {
  const card = buildCard(document, errorModel, {});
  assert.equal(card.querySelector('.cx-loading'), null);
  assert.equal(card.querySelectorAll('.cx-row').length, 0);
  assert.equal(card.querySelector('.cx-best'), null);
});

test('each error kind gets its own wording', () => {
  const kinds = ['network', 'timeout', 'offline', 'unknown'];
  const seen = new Set();
  for (const kind of kinds) {
    const card = buildCard(document, { ...errorModel, error: { kind } }, {});
    const text = card.querySelector('.cx-error-msg').textContent.trim();
    assert.ok(text.length > 0, kind + ' has no message');
    seen.add(text);
  }
  assert.equal(seen.size, kinds.length, 'error kinds share wording');
});

test('an unknown kind falls back rather than rendering an empty message', () => {
  const card = buildCard(document, { ...errorModel, error: { kind: 'nonsense' } }, {});
  assert.ok(card.querySelector('.cx-error-msg').textContent.trim().length > 0);
});

test('a missing error object still renders a usable card', () => {
  const card = buildCard(document, { ...errorModel, error: null }, {});
  assert.ok(card.querySelector('.cx-error'));
  assert.ok(card.querySelector('.cx-error-msg').textContent.trim().length > 0);
});

test('minimizing during an error keeps the pill, not the error block', () => {
  const card = buildCard(document, { ...errorModel, minimized: true }, {});
  assert.equal(card.className, 'cx-pill');
  assert.equal(card.querySelector('.cx-error'), null);
});

test('every shipped language carries the error wording', () => {
  for (const lang of LANGS) {
    for (const key of ['errNetwork', 'errTimeout', 'errOffline', 'errUnknown', 'retry', 'reportBug', 'errorTitle']) {
      const value = t(lang, key);
      assert.ok(typeof value === 'string' && value.length > 0, `${lang}.${key} missing`);
    }
  }
});

test('the error block is translated, not stuck in English', () => {
  const de = buildCard(document, { ...errorModel, uiLang: 'de' }, {});
  const en = buildCard(document, { ...errorModel, uiLang: 'en' }, {});
  assert.notEqual(de.querySelector('.cx-error-msg').textContent, en.querySelector('.cx-error-msg').textContent);
});
