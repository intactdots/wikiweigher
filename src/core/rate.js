export const STORE_ID = 'liepeplciapidcddoaihbemdhgijceja';
export const AMO_SLUG = '';
export const RATE_DEFAULTS = { runs: 0, next: 5, done: false };

function num(v, fb) {
  return typeof v === 'number' && isFinite(v) ? v : fb;
}

export function recordRun(r) {
  return { ...r, runs: num(r.runs, 0) + 1 };
}

export function published(gecko = false) {
  return gecko ? AMO_SLUG.length > 0 : STORE_ID.length > 0;
}

export function shouldPrompt(r, storeReady = published()) {
  if (!storeReady) return false;
  return !r.done && num(r.runs, 0) >= num(r.next, RATE_DEFAULTS.next);
}

export function later(r) {
  return { ...r, next: num(r.runs, 0) + 15 };
}

export function never(r) {
  return { ...r, done: true };
}

export function rated(r) {
  return { ...r, done: true };
}

export function reviewsUrl(gecko = false) {
  if (!published(gecko)) return '';
  return gecko
    ? 'https://addons.mozilla.org/firefox/addon/' + AMO_SLUG + '/reviews/'
    : 'https://chromewebstore.google.com/detail/' + STORE_ID + '/reviews';
}

export async function getRate(store) {
  const obj = await store.get('wikiweigherRate');
  return { ...RATE_DEFAULTS, ...(obj?.wikiweigherRate || {}) };
}

export async function setRate(r, store) {
  await store.set({ wikiweigherRate: r });
  return r;
}
