import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffFromDefaults, browserLabel, shortUA, redact, NEVER_COLLECT } from '../src/core/diagnostics.js';
import { DEFAULTS } from '../src/settings/schema.js';

test('only settings the user actually changed are reported', () => {
  const out = diffFromDefaults({ ...DEFAULTS, weight: 0.75, accent: 'teal' });
  assert.deepEqual(out, { weight: 0.75, accent: 'teal' });
});

test('an untouched settings object reports nothing', () => {
  assert.deepEqual(diffFromDefaults({ ...DEFAULTS }), {});
});

test('array settings compare by value, not by reference', () => {
  assert.deepEqual(diffFromDefaults({ ...DEFAULTS, languagesIRead: [] }), {});
  assert.deepEqual(diffFromDefaults({ ...DEFAULTS, languagesIRead: ['sv'] }), { languagesIRead: ['sv'] });
});

test('keys outside the schema are never echoed back', () => {
  assert.deepEqual(diffFromDefaults({ ...DEFAULTS, secretToken: 'abc' }), {});
});

test('a missing settings object is survivable', () => {
  assert.deepEqual(diffFromDefaults(null), {});
});

test('the user agent is reduced to a brand and a major version', () => {
  assert.equal(shortUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'), 'Chrome 149');
  assert.equal(shortUA('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/148.0.0.0 Safari/537.36 Edg/148.0.2210.91'), 'Edge 148');
});

test('an unrecognised user agent degrades instead of leaking itself', () => {
  const out = shortUA('something entirely unexpected 1.2.3');
  assert.equal(out, 'unknown');
});

test('brand data is preferred over the user agent string', () => {
  const nav = { userAgentData: { brands: [{ brand: 'Not.A/Brand', version: '99' }, { brand: 'Google Chrome', version: '149' }] } };
  assert.equal(browserLabel(nav), 'Google Chrome 149');
});

test('browserLabel falls back to the user agent when brands are absent', () => {
  assert.equal(browserLabel({ userAgent: 'Mozilla/5.0 Chrome/149.0.0.0 Safari/537.36' }), 'Chrome 149');
});

test('a legacy diagnostics blob loses its full URL but keeps the hostname', () => {
  const out = redact({ url: 'https://en.wikipedia.org/wiki/Mount_Everest?veaction=edit&token=secret', title: 'Mount Everest', phase: 'ready' });
  assert.equal('url' in out, false);
  assert.equal(out.host, 'en.wikipedia.org');
  assert.equal(out.title, 'Mount Everest');
});

test('a legacy raw user agent is reduced, not passed through', () => {
  const out = redact({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/149.0.0.0 Safari/537.36' });
  assert.equal('ua' in out, false);
  assert.equal(out.browser, 'Chrome 149');
});

test('an existing hostname is not overwritten by a legacy URL', () => {
  const out = redact({ url: 'https://de.wikipedia.org/wiki/X', host: 'en.wikipedia.org' });
  assert.equal(out.host, 'en.wikipedia.org');
});

test('every field on the never-collect list is stripped', () => {
  const dirty = Object.fromEntries(NEVER_COLLECT.map(k => [k, 'leak']));
  const out = redact({ ...dirty, phase: 'ready' });
  for (const key of NEVER_COLLECT) assert.equal(key in out, false, key + ' survived redaction');
  assert.equal(out.phase, 'ready');
});

test('redacting nothing yields nothing rather than throwing', () => {
  assert.equal(redact(null), null);
  assert.equal(redact('corrupt'), null);
});
