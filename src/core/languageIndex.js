import { fetchJson as defaultFetch } from './api.js';

export function langlinksUrl(lang, title) {
  return `https://${lang}.wikipedia.org/w/api.php?action=query&prop=langlinks&llprop=url&lllimit=500&redirects=1&format=json&maxlag=5&origin=*&titles=${encodeURIComponent(title)}`;
}

export async function getLanguages(lang, title, deps = {}) {
  const fetchJson = deps.fetchJson || defaultFetch;
  const j = await fetchJson(langlinksUrl(lang, title));
  if (!j) return null;
  const pages = j?.query?.pages || {};
  const page = Object.values(pages)[0];
  const out = [{ lang, title: page?.title || title, site: lang + '.wikipedia.org' }];
  for (const ll of page?.langlinks || []) {
    let site = ll.lang + '.wikipedia.org';
    if (ll.url) {
      try {
        const host = new URL(ll.url).host;
        if (host.endsWith('.wikipedia.org')) site = host;
      } catch {}
    }
    out.push({ lang: ll.lang, title: ll['*'], site });
  }
  return out;
}
