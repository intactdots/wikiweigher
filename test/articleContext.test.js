import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { getContext } from '../src/core/articleContext.js';

function doc(bodyClass, canonical, logoHref) {
  const { document } = parseHTML(`<!doctype html><html><head><link rel="canonical" href="${canonical}"></head><body class="${bodyClass}"><a class="mw-logo-link" href="${logoHref}"></a></body></html>`);
  return document;
}

function loc(host, path) {
  return { hostname: host, pathname: path, origin: 'https://' + host };
}

test('returns lang and title for an article', () => {
  const d = doc('skin-vector ns-0 ns-subject', 'https://en.wikipedia.org/wiki/Mount_Everest', '/wiki/Main_Page');
  assert.deepEqual(getContext(loc('en.wikipedia.org', '/wiki/Mount_Everest'), d), { lang: 'en', title: 'Mount Everest' });
});

test('returns null for a non-article namespace', () => {
  const d = doc('ns-1 ns-talk', 'https://en.wikipedia.org/wiki/Talk:Mount_Everest', '/wiki/Main_Page');
  assert.equal(getContext(loc('en.wikipedia.org', '/wiki/Talk:Mount_Everest'), d), null);
});

test('returns null on the main page', () => {
  const d = doc('ns-0', 'https://en.wikipedia.org/wiki/Main_Page', '/wiki/Main_Page');
  assert.equal(getContext(loc('en.wikipedia.org', '/wiki/Main_Page'), d), null);
});

test('reads the language from the subdomain', () => {
  const d = doc('ns-0', 'https://de.wikipedia.org/wiki/Mount_Everest', '/wiki/Wikipedia:Hauptseite');
  assert.equal(getContext(loc('de.wikipedia.org', '/wiki/Mount_Everest'), d).lang, 'de');
});
