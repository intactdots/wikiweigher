import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RATE_DEFAULTS, recordRun, shouldPrompt, later, never, rated, reviewsUrl, published, STORE_ID, AMO_SLUG } from '../src/core/rate.js';

const LISTED = true;

test('no prompt before threshold', () => {
  let r = { ...RATE_DEFAULTS };
  for (let i = 0; i < 4; i++) r = recordRun(r);
  assert.equal(r.runs, 4);
  assert.equal(shouldPrompt(r, LISTED), false);
});

test('prompts at threshold once the extension is listed', () => {
  let r = { ...RATE_DEFAULTS };
  for (let i = 0; i < 5; i++) r = recordRun(r);
  assert.equal(shouldPrompt(r, LISTED), true);
});

test('never asks for a rating before there is a store page to rate on', () => {
  let r = { ...RATE_DEFAULTS };
  for (let i = 0; i < 50; i++) r = recordRun(r);
  assert.equal(shouldPrompt(r, false), false);
  assert.equal(shouldPrompt(r), published(), 'the live default must follow whether a store id is set');
});

test('an unlisted build has no review link to offer', () => {
  if (STORE_ID) {
    assert.match(reviewsUrl(), /^https:\/\/chromewebstore\.google\.com\/detail\/.+\/reviews$/);
  } else {
    assert.equal(published(), false);
    assert.equal(reviewsUrl(), '');
  }
});

test('later defers by 15 runs then prompts again', () => {
  let r = { ...RATE_DEFAULTS, runs: 5 };
  r = later(r);
  assert.equal(shouldPrompt(r, LISTED), false);
  for (let i = 0; i < 14; i++) r = recordRun(r);
  assert.equal(shouldPrompt(r, LISTED), false);
  r = recordRun(r);
  assert.equal(shouldPrompt(r, LISTED), true);
});

test('never and rated are permanent', () => {
  for (const fn of [never, rated]) {
    let r = fn({ ...RATE_DEFAULTS, runs: 50 });
    assert.equal(shouldPrompt(r, LISTED), false);
    for (let i = 0; i < 100; i++) r = recordRun(r);
    assert.equal(shouldPrompt(r, LISTED), false);
  }
});

test('malformed stored state falls back safely', () => {
  assert.equal(shouldPrompt({ ...RATE_DEFAULTS, ...null }, LISTED), false);
  const r = recordRun({ ...RATE_DEFAULTS, ...{ runs: 'x' } });
  assert.equal(typeof r.runs, 'number');
});

test('a gecko build never points at the chrome web store', () => {
  const url = reviewsUrl(true);
  if (AMO_SLUG) {
    assert.match(url, /^https:\/\/addons\.mozilla\.org\/firefox\/addon\/.+\/reviews\/$/);
  } else {
    assert.equal(url, '', 'with no listing yet there is nothing to link');
    assert.equal(published(true), false);
  }
  assert.doesNotMatch(url, /chromewebstore/);
});
