import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countWords } from '../src/core/wordcount.js';

test('latin counts whitespace tokens', () => {
  assert.equal(countWords('the quick brown fox'), 4);
});

test('collapses extra whitespace and newlines', () => {
  assert.equal(countWords('  a\n\n b   c '), 3);
});

test('korean counts by spaces not syllables', () => {
  assert.equal(countWords('대한민국 서울 특별시'), 3);
});

test('cjk han and kana counted at half weight', () => {
  assert.equal(countWords('東京'), 1);
  assert.equal(countWords('東京都は'), 2);
});

test('mixed scripts add latin tokens plus scaled cjk', () => {
  assert.equal(countWords('Tokyo 東京 metropolis'), 3);
});

test('empty or nullish is zero', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords(null), 0);
});
