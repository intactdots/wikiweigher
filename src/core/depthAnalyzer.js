import { fetchJson as defaultFetch } from './api.js';
import { extractProse, countRefs, structure } from './prose.js';
import { countWords } from './wordcount.js';

export function parseHtmlUrl(site, title) {
  return `https://${site}/w/api.php?action=parse&prop=text&redirects=1&format=json&maxlag=5&origin=*&page=${encodeURIComponent(title)}`;
}

export function infoUrl(site, title) {
  return `https://${site}/w/api.php?action=query&prop=info&redirects=1&format=json&maxlag=5&origin=*&titles=${encodeURIComponent(title)}`;
}

function defaultParse(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

export async function getQuickSize(site, title, deps = {}) {
  const fetchJson = deps.fetchJson || defaultFetch;
  const j = await fetchJson(infoUrl(site, title), 2);
  const page = Object.values(j?.query?.pages || {})[0];
  return page?.length || 0;
}

export async function getExact(site, title, deps = {}) {
  const fetchJson = deps.fetchJson || defaultFetch;
  const parse = deps.parse || defaultParse;
  const j = await fetchJson(parseHtmlUrl(site, title), 4, 25000);
  const html = j?.parse?.text?.['*'];
  if (!html) return null;
  const doc = parse(html);
  const s = structure(doc);
  return { words: countWords(extractProse(doc)), refs: countRefs(doc), sections: s.sections, images: s.images, tables: s.tables };
}
