import { fetchJson as defaultFetch } from './api.js';

const BADGE = { Q17437796: 'featured', Q17437798: 'good' };

export function wikidataIdUrl(lang, title) {
  return `https://${lang}.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&maxlag=5&origin=*&titles=${encodeURIComponent(title)}`;
}

export function entitiesUrl(qid) {
  return `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=sitelinks&format=json&origin=*`;
}

export function dbnameFor(site) {
  return site.split('.')[0].replace(/-/g, '_') + 'wiki';
}

export async function getQualityBadges(lang, title, deps = {}) {
  const fetchJson = deps.fetchJson || defaultFetch;
  const j = await fetchJson(wikidataIdUrl(lang, title));
  const page = Object.values(j?.query?.pages || {})[0];
  const qid = page?.pageprops?.wikibase_item;
  if (!qid) return {};
  const j2 = await fetchJson(entitiesUrl(qid));
  const links = j2?.entities?.[qid]?.sitelinks || {};
  const out = {};
  for (const [dbname, link] of Object.entries(links)) {
    const badge = (link.badges || []).map(b => BADGE[b]).find(Boolean);
    if (badge) out[dbname] = badge;
  }
  return out;
}
