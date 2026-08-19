import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { readFileSync } from 'node:fs';
import { extractProse, countRefs, structure } from '../src/core/prose.js';

const html = readFileSync(new URL('./fixtures/article-en.html', import.meta.url), 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');

test('prose includes lead and excludes infobox and reflist', () => {
  const t = extractProse(doc);
  assert.match(t, /highest mountain/);
  assert.doesNotMatch(t, /INFOBOX_ELEVATION_VALUE/);
  assert.doesNotMatch(t, /REFLIST_CITATION_TEXT/);
});

test('prose strips inline reference markers', () => {
  const t = extractProse(doc);
  assert.doesNotMatch(t, /\[1\]/);
});

test('countRefs counts reference list items', () => {
  assert.equal(countRefs(doc), 3);
});

test('structure counts sections, images and tables', () => {
  const s = structure(doc);
  assert.equal(s.sections, 2);
  assert.equal(s.images, 1);
  assert.equal(s.tables, 1);
});
