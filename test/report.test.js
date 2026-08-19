import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportUrl, reportText, MAX_URL, MARKER, REPO, TEMPLATE } from '../src/core/report.js';

const diag = { v: '0.7.0', phase: 'ready', host: 'en.wikipedia.org', title: 'Mount Everest', lang: 'en', browser: 'Chrome 149', os: 'win', settings: { weight: 0.75 }, ms: 2400 };

test('the report targets the bug form and prefills the diagnostics field', () => {
  const { url } = reportUrl(diag, []);
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, `https://github.com/${REPO}/issues/new`);
  assert.equal(u.searchParams.get('template'), TEMPLATE);
  assert.ok(u.searchParams.get('diagnostics').includes('Mount Everest'));
});

test('no permission-gated parameter is ever put in the URL', () => {
  const u = new URL(reportUrl(diag, []).url);
  for (const forbidden of ['labels', 'assignees', 'milestone', 'projects']) {
    assert.equal(u.searchParams.has(forbidden), false, forbidden + ' would 404 for a reporter without write access');
  }
});

test('the body carries a marker the extension writes and a typist would not', () => {
  assert.ok(reportText(diag, []).includes(MARKER));
  assert.ok(new URL(reportUrl(diag, []).url).searchParams.get('diagnostics').includes(MARKER));
});

test('the dump is wrapped so it does not bury the report', () => {
  const text = reportText(diag, []);
  assert.ok(text.includes('<details>'));
  assert.ok(text.includes('</details>'));
});

test('a normal report fits inside the URL budget', () => {
  const { url, overflow } = reportUrl(diag, [{ t: Date.now(), level: 'error', msg: 'boom' }]);
  assert.equal(overflow, false);
  assert.ok(url.length <= MAX_URL, `url was ${url.length}`);
});

const bigDiag = {
  ...diag,
  analyzed: Array.from({ length: 24 }, (_, i) => ({ lang: 'ja', site: 'ja.wikipedia.org', title: 'エベレスト山の登頂記録と地理的特徴について' + i, words: 12345, refs: 210, badge: 'featured' }))
};

test('the log is capped so a noisy session cannot inflate the report', () => {
  const noisy = Array.from({ length: 400 }, (_, i) => ({ t: 0, level: 'error', msg: 'x'.repeat(500) + i }));
  const { url, overflow } = reportUrl(diag, noisy);
  assert.equal(overflow, false);
  assert.ok(url.length <= MAX_URL, `url was ${url.length}`);
});

test('an oversized dump drops the parameter rather than producing a broken link', () => {
  const { url, overflow, body } = reportUrl(bigDiag, []);
  assert.equal(overflow, true, 'expected the big diagnostics blob to overflow');
  assert.ok(url.length <= MAX_URL, `url was ${url.length}`);
  assert.equal(new URL(url).searchParams.has('diagnostics'), false);
  assert.ok(body.includes('エベレスト'), 'the full body must still be available for the clipboard');
});

test('the overflow link still opens the right form', () => {
  const u = new URL(reportUrl(bigDiag, []).url);
  assert.equal(u.searchParams.get('template'), TEMPLATE);
});

test('only errors and warnings reach the report, not the whole log', () => {
  const log = [
    { t: 0, level: 'info', msg: 'boot' },
    { t: 0, level: 'error', msg: 'kaboom' },
    { t: 0, level: 'warn', msg: 'hmm' }
  ];
  const text = reportText(diag, log);
  assert.ok(text.includes('kaboom'));
  assert.ok(text.includes('hmm'));
  assert.equal(text.includes('boot'), false);
});

test('a report with no run recorded still produces something sendable', () => {
  const { url, overflow } = reportUrl(null, []);
  assert.equal(overflow, false);
  assert.ok(new URL(url).searchParams.get('diagnostics').length > 0);
});
