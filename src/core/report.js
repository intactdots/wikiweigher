import { redact } from './diagnostics.js';

export const REPO = 'intactdots/wikiweigher';
export const TEMPLATE = 'bug.yml';

export function repoUrl(path = '') {
  return `https://github.com/${REPO}${path}`;
}
export const MAX_URL = 7500;
export const MARKER = 'wikiweigher-report/1';

export const LOG_KEYS = ['wikiweigherDebug', 'wikiweigherDebugSw', 'wikiweigherDebugUi'];

export function mergeLogs(obj = {}) {
  return LOG_KEYS
    .flatMap(k => (Array.isArray(obj[k]) ? obj[k] : []))
    .filter(e => e && typeof e.t === 'number')
    .sort((a, b) => a.t - b.t);
}

function logLines(log) {
  return (Array.isArray(log) ? log : [])
    .filter(e => e && (e.level === 'error' || e.level === 'warn'))
    .slice(-12)
    .map(e => `${String(e.level).toUpperCase()} ${String(e.msg || '').slice(0, 300)}`);
}

export function reportText(diag, log) {
  const safe = redact(diag);
  const lines = logLines(log);
  const parts = [
    MARKER,
    '',
    '<details>',
    '',
    '```json',
    JSON.stringify(safe || { note: 'no article run recorded yet' }, null, 2),
    '```'
  ];
  if (lines.length) {
    parts.push('', '```', ...lines, '```');
  }
  parts.push('', '</details>');
  return parts.join('\n');
}

function base() {
  const url = new URL(`https://github.com/${REPO}/issues/new`);
  url.searchParams.set('template', TEMPLATE);
  return url;
}

export function reportUrl(diag, log) {
  const body = reportText(diag, log);
  const full = base();
  full.searchParams.set('diagnostics', body);
  if (full.href.length <= MAX_URL) return { url: full.href, overflow: false, body };
  return { url: base().href, overflow: true, body };
}

export const SUPPORT_EMAIL = 'support@intactdots.com';

export const MAX_MAILTO = 1900;

export function mailtoUrl(diag, log, version = '') {
  const body = reportText(diag, log);
  const subject = `Wikiweigher bug report${version ? ' ' + version : ''}`;
  const lead = [
    'What happened:',
    '',
    '',
    'Which article:',
    '',
    '',
    'Steps to reproduce:',
    '1.',
    '2.',
    '',
    '---',
  ].join('\n');

  const withDiag = `${lead}\n${body}\n`;
  const short = `${lead}\nDiagnostics are attached, or pasted below from the clipboard.\n`;

  const build = text => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

  const full = build(withDiag);
  if (full.length <= MAX_MAILTO) return { url: full, inlined: true, body };
  return { url: build(short), inlined: false, body };
}
