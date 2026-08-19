const NODE = typeof window === 'undefined';
const VERSION = NODE ? (process.env.npm_package_version || '1.0.0')
  : globalThis.chrome?.runtime?.getManifest?.().version || '1.0.0';
const UA = `Wikiweigher/${VERSION} (https://github.com/intactdots/wikiweigher; Wikipedia language ranker)`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function fetchJson(url, tries = 4, timeoutMs = 15000) {
  for (let t = 0; t < tries; t++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), timeoutMs);
      const opts = { signal: ctrl.signal, credentials: 'omit' };
      if (NODE) opts.headers = { 'User-Agent': UA };
      const res = await fetch(url, opts);
      clearTimeout(to);
      if (res.status === 429) { await sleep(1000 * (t + 1)); continue; }
      if (!res.ok) throw new Error('http ' + res.status);
      const body = await res.json();
      if (body && body.error) throw new Error('api ' + (body.error.code || 'error'));
      return body;
    } catch {
      if (t === tries - 1) return null;
      await sleep(500 * (t + 1));
    }
  }
  return null;
}

export async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
