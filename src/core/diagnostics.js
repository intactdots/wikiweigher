import { DEFAULTS } from '../settings/schema.js';

export const NEVER_COLLECT = ['url', 'ua', 'href', 'search', 'query', 'referrer', 'cookie', 'selection'];

const UA_BRANDS = [
  [/\bEdg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
  [/\bOPR\/(\d+)/, 'Opera'],
  [/\bVivaldi\/(\d+)/, 'Vivaldi'],
  [/\bFirefox\/(\d+)/, 'Firefox'],
  [/\bChrome\/(\d+)/, 'Chrome'],
  [/\bVersion\/(\d+).*\bSafari\//, 'Safari']
];

export function shortUA(ua) {
  if (typeof ua !== 'string') return 'unknown';
  for (const [re, name] of UA_BRANDS) {
    const m = re.exec(ua);
    if (m) return name + ' ' + m[1];
  }
  return 'unknown';
}

export function browserLabel(nav) {
  const brands = nav && nav.userAgentData && nav.userAgentData.brands;
  if (Array.isArray(brands)) {
    const real = brands.find(b => b && typeof b.brand === 'string' && !/not[.:/ ]?a[.:/ ]?brand/i.test(b.brand));
    if (real) return `${real.brand} ${String(real.version || '').split('.')[0]}`.trim();
  }
  return shortUA(nav && nav.userAgent);
}

export function osLabel(nav) {
  const platform = nav && ((nav.userAgentData && nav.userAgentData.platform) || nav.platform);
  return typeof platform === 'string' && platform ? platform : 'unknown';
}

export function diffFromDefaults(settings) {
  const out = {};
  if (!settings || typeof settings !== 'object') return out;
  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in settings)) continue;
    if (JSON.stringify(settings[key]) === JSON.stringify(DEFAULTS[key])) continue;
    out[key] = settings[key];
  }
  return out;
}

export function redact(diag) {
  if (!diag || typeof diag !== 'object' || Array.isArray(diag)) return null;
  const out = {};
  for (const [key, value] of Object.entries(diag)) {
    if (NEVER_COLLECT.includes(key)) continue;
    out[key] = value;
  }
  if (!out.host && typeof diag.url === 'string') {
    try { out.host = new URL(diag.url).hostname; } catch { out.host = 'unknown'; }
  }
  if (!out.browser && typeof diag.ua === 'string') out.browser = shortUA(diag.ua);
  if (out.settings) out.settings = diffFromDefaults(out.settings);
  return out;
}
