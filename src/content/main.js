import { getContext } from '../core/articleContext.js';
import { getLanguages } from '../core/languageIndex.js';
import { getQuickSize, getExact } from '../core/depthAnalyzer.js';
import { buildModel } from '../core/model.js';
import { getSettings } from '../settings/settings.js';
import { getLayout, setLayout, clampToViewport } from '../settings/layout.js';
import { migrate } from '../settings/migrate.js';
import { getCached, setCached } from '../core/cache.js';
import { pool } from '../core/api.js';
import { renderCard } from '../ui/card.js';
import { debug, install, setStore, setStatus } from '../core/debug.js';
import { getQualityBadges, dbnameFor } from '../core/wikidata.js';
import { getRate, setRate, recordRun, shouldPrompt, later, never, rated, reviewsUrl, published } from '../core/rate.js';
import { diffFromDefaults, browserLabel, osLabel } from '../core/diagnostics.js';
import { ext as chrome, gecko } from '../core/ext.js';

const TTL = 7 * 24 * 60 * 60 * 1000;
const RUN_TIMEOUT = 45000;
const CANDIDATE_CAP = 50;
const MAJOR = ['en', 'de', 'fr', 'es', 'ja', 'ru', 'it', 'zh', 'pt', 'fa', 'ar', 'pl', 'nl', 'uk', 'sv', 'vi', 'id', 'ko', 'tr', 'fi', 'cs', 'hu', 'ca', 'sr', 'ro', 'no', 'he', 'bg', 'da', 'simple', 'el', 'hi', 'th', 'eu', 'sk', 'et', 'be', 'ml', 'la', 'ur', 'hr', 'lt', 'sl', 'az'];
const HOST_ID = 'wikiweigher-host';
const store = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) || null;

const MANIFEST = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest() : { version: '?' };

install();
setStore(store);
debug.info('boot', 'v' + MANIFEST.version, typeof location !== 'undefined' ? location.hostname : '');

function snapSettings(s) {
  return diffFromDefaults(s);
}

function persistDiag(d) {
  if (d && d.phase) setStatus(d.errorKind ? 'error:' + d.errorKind : d.phase);
  if (!store) return;
  const base = { v: MANIFEST.version, ts: Date.now(), host: location.hostname, browser: browserLabel(navigator), os: osLabel(navigator) };
  store.set({ wikiweigherDiag: { ...base, ...d } }).catch(() => {});
}

function mountHost(position) {
  let host = document.getElementById(HOST_ID);
  if (host) return host;
  host = document.createElement('div');
  host.id = HOST_ID;
  const pos = clampToViewport(position, window.innerWidth, window.innerHeight);
  host.style.cssText = pos
    ? `position:fixed;top:${pos.top}px;left:${pos.left}px;z-index:2147483000;`
    : 'position:fixed;top:90px;right:16px;z-index:2147483000;';
  document.body.appendChild(host);
  return host;
}

function entryOf(state, lang) {
  return state.langs.find(l => l.lang === lang) || {};
}

function articleUrl(site, title) {
  return `https://${site}/wiki/${encodeURIComponent((title || '').replace(/ /g, '_'))}`;
}

function draw(host, state, handlers) {
  const model = buildModel(state);
  model.ratePrompt = state.ratePrompt;
  renderCard(host, model, handlers);
}

async function analyze(lang, site, title) {
  const key = `x:${lang}:${title}`;
  if (store) {
    const cached = await getCached(key, store);
    if (cached) return cached;
  }
  const r = await getExact(site, title);
  if (r && store) await setCached(key, r, TTL, store);
  return r;
}

function makeHandlers(host, state) {
  const handlers = {
    onOpen: lang => { const e = entryOf(state, lang); window.open(articleUrl(e.site, e.title), '_blank', 'noopener'); },
    onTranslate: lang => {
      const e = entryOf(state, lang);
      const url = articleUrl(e.site, e.title);
      window.open(`https://translate.google.com/translate?sl=${lang}&tl=${state.current}&u=${encodeURIComponent(url)}`, '_blank', 'noopener');
    },
    onMinimize: () => { state.minimized = true; if (store) setLayout({ startMinimized: true }, store); draw(host, state, handlers); },
    onRestore: () => { state.minimized = false; if (store) setLayout({ startMinimized: false }, store); draw(host, state, handlers); },
    onClose: () => host.remove(),
    onMoved: pos => { if (store) setLayout({ position: pos }, store); },
    onClickLang: async lang => {
      if (state.exact[lang]) { handlers.onOpen(lang); return; }
      const e = entryOf(state, lang);
      const r = await analyze(lang, e.site, e.title);
      if (r) { state.exact[lang] = r; draw(host, state, handlers); }
    },
    onRetry: () => { run().catch(e => debug.error('retry crashed', e)); },
    onReport: () => {
      try {
        chrome.runtime.sendMessage({ type: 'open-support' });
      } catch (e) {
        debug.error('report open failed', e);
      }
    },
    onRate: async () => {
      const url = reviewsUrl(gecko);
      if (url) window.open(url, '_blank', 'noopener');
      state.ratePrompt = false;
      if (store) await setRate(rated(await getRate(store)), store);
      draw(host, state, handlers);
    },
    onRateLater: async () => {
      state.ratePrompt = false;
      if (store) await setRate(later(await getRate(store)), store);
      draw(host, state, handlers);
    },
    onRateNever: async () => {
      state.ratePrompt = false;
      if (store) await setRate(never(await getRate(store)), store);
      draw(host, state, handlers);
    }
  };
  return handlers;
}

function pickCandidates(langs, current, reads) {
  const have = new Set(langs.map(l => l.lang));
  const order = [];
  const add = c => { if (have.has(c) && !order.includes(c)) order.push(c); };
  add(current);
  for (const c of reads || []) add(c);
  for (const c of MAJOR) add(c);
  for (const l of langs) add(l.lang);
  return order.slice(0, CANDIDATE_CAP).map(c => langs.find(l => l.lang === c));
}

let running = false;
let pending = false;
let lastRunKey = '';
let lastDrawKey = '';
let live = null;

let watchdog = null;

function clearWatchdog() {
  if (watchdog) { clearTimeout(watchdog); watchdog = null; }
}

function armWatchdog(host, state, handlers, ctx, settings, started) {
  clearWatchdog();
  watchdog = setTimeout(() => {
    watchdog = null;
    if (state.state === 'ready' || state.state === 'error') return;
    if (!document.getElementById(HOST_ID)) return;
    state.state = 'error';
    state.error = { kind: 'timeout' };
    draw(host, state, handlers);
    debug.error('run timed out after ' + RUN_TIMEOUT + 'ms');
    persistDiag({ phase: 'error', errorKind: 'timeout', lang: ctx.lang, title: ctx.title, settings: snapSettings(settings), ms: Date.now() - started });
  }, RUN_TIMEOUT);
}

let migrated = false;

async function ensureMigrated() {
  if (migrated || !store) return;
  migrated = true;
  await migrate(store);
}

function runKeyOf(s) {
  return [s.enabled, s.analyze, (s.languagesIRead || []).join(',')].join('|');
}

function drawKeyOf(s) {
  return [s.weight, s.theme, s.accent, s.cardLang].join('|');
}

function navLangs() {
  const nav = typeof navigator !== 'undefined' ? (navigator.languages || [navigator.language]) : [];
  return nav.filter(Boolean).map(l => l.split('-')[0]);
}

async function run() {
  if (running) { pending = true; return; }
  running = true;
  try {
    do {
      pending = false;
      try {
        await runInner();
      } catch (e) {
        clearWatchdog();
        debug.error('run crashed', e);
        if (live && document.getElementById(HOST_ID)) {
          live.state.state = 'error';
          live.state.error = { kind: 'unknown' };
          draw(live.host, live.state, live.handlers);
          persistDiag({ phase: 'error', errorKind: 'unknown', message: String(e && e.message || e).slice(0, 300) });
        }
      }
    } while (pending);
  } finally {
    running = false;
  }
}

async function runInner() {
  const started = Date.now();
  const ctx = getContext(location, document);
  debug.info('context', JSON.stringify(ctx));
  if (!ctx) { persistDiag({ phase: 'not-an-article' }); return; }
  await ensureMigrated();
  const settings = await getSettings(store);
  const layout = await getLayout(store);
  lastRunKey = runKeyOf(settings);
  lastDrawKey = drawKeyOf(settings);
  if (!settings.languagesIRead || !settings.languagesIRead.length) settings.languagesIRead = navLangs();
  debug.info('settings enabled=' + settings.enabled + ' weight=' + settings.weight + ' analyze=' + settings.analyze);
  if (!settings.enabled) { persistDiag({ phase: 'disabled', lang: ctx.lang, title: ctx.title, settings: snapSettings(settings) }); return; }

  const state = {
    current: ctx.lang,
    uiLang: settings.cardLang && settings.cardLang !== 'auto' ? settings.cardLang : ctx.lang,
    settings,
    minimized: layout.startMinimized,
    langs: [],
    sizes: {},
    exact: {},
    state: 'loading'
  };
  const host = mountHost(layout.position);
  const handlers = makeHandlers(host, state);
  live = { host, state, handlers };
  setStatus('loading');
  draw(host, state, handlers);

  const fail = (rawKind, note) => {
    const kind = rawKind === 'network' && typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : rawKind;
    clearWatchdog();
    state.state = 'error';
    state.error = { kind };
    draw(host, state, handlers);
    debug.error('run failed kind=' + kind + (note ? ' ' + note : ''));
    persistDiag({ phase: 'error', errorKind: kind, lang: ctx.lang, title: ctx.title, settings: snapSettings(settings), ms: Date.now() - started });
  };

  armWatchdog(host, state, handlers, ctx, settings, started);

  const allLangs = await getLanguages(ctx.lang, ctx.title);
  if (allLangs === null) { fail('network', 'langlinks unreachable'); return; }
  debug.info('languages found=' + allLangs.length);
  if (allLangs.length < 2) { clearWatchdog(); host.remove(); persistDiag({ phase: 'too-few-languages', lang: ctx.lang, title: ctx.title, total: allLangs.length, settings: snapSettings(settings) }); return; }
  if (typeof location !== 'undefined' && allLangs[0]) allLangs[0].site = location.hostname;
  const badges = await getQualityBadges(ctx.lang, ctx.title);
  for (const l of allLangs) l.badge = badges[dbnameFor(l.site)] || null;
  debug.info('badges=' + Object.keys(badges).length);
  const candidates = pickCandidates(allLangs, state.current, settings.languagesIRead);
  debug.info('candidates=' + candidates.length + ' of ' + allLangs.length);
  state.langs = candidates;
  state.total = allLangs.length;
  state.state = 'estimated';
  setStatus('estimated');
  draw(host, state, handlers);

  const sizes = await pool(candidates, 6, async l => [l.lang, await getQuickSize(l.site, l.title)]);
  for (const [lang, size] of sizes) state.sizes[lang] = size;
  debug.info('sizes done');
  draw(host, state, handlers);

  const N = Math.max(1, Math.min(settings.analyze || 12, candidates.length));
  const top = [...candidates].sort((a, b) => (state.sizes[b.lang] || 0) - (state.sizes[a.lang] || 0)).slice(0, N);
  if (!top.some(l => l.lang === state.current)) {
    const cur = candidates.find(l => l.lang === state.current);
    if (cur) { top.pop(); top.push(cur); }
  }
  await pool(top, 4, async l => {
    const r = await analyze(l.lang, l.site, l.title);
    if (r) state.exact[l.lang] = r;
  });
  if (!Object.keys(state.exact).length) { fail('network', 'no article could be analyzed'); return; }
  clearWatchdog();
  state.state = 'ready';
  debug.info('exact done=' + Object.keys(state.exact).length + ' ready');
  if (store) {
    const r = recordRun(await getRate(store));
    await setRate(r, store);
    state.ratePrompt = shouldPrompt(r, published(gecko));
  }
  draw(host, state, handlers);

  const model = buildModel(state);
  persistDiag({
    phase: 'ready',
    lang: ctx.lang,
    title: ctx.title,
    settings: snapSettings(settings),
    total: state.total,
    candidates: candidates.length,
    analyzedCount: Object.keys(state.exact).length,
    analyzed: candidates.filter(l => state.exact[l.lang]).map(l => ({ lang: l.lang, site: l.site, words: state.exact[l.lang].words, refs: state.exact[l.lang].refs, badge: l.badge || null })),
    best: model.best ? { lang: model.best.lang, words: model.best.words, refs: model.best.refs } : null,
    bestSourced: model.bestSourced ? { lang: model.bestSourced.lang, refs: model.bestSourced.refs } : null,
    verdict: model.verdict ? model.verdict.type : null,
    ms: Date.now() - started
  });
}

function watchSettings() {
  if (!store || typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const s = changes.settings.newValue || {};
    const old = changes.settings.oldValue || {};
    const host = document.getElementById(HOST_ID);
    const rk = runKeyOf(s);
    const dk = drawKeyOf(s);
    if (s.enabled === false) { if (host) host.remove(); lastRunKey = rk; lastDrawKey = dk; return; }
    const reEnabled = old.enabled === false;
    if (!host && !reEnabled) { lastRunKey = rk; lastDrawKey = dk; return; }
    if (rk !== lastRunKey || reEnabled || !live) {
      lastRunKey = rk;
      lastDrawKey = dk;
      run().catch(e => debug.error('reapply crashed', e));
      return;
    }
    if (dk === lastDrawKey) return;
    lastDrawKey = dk;
    const next = { ...s };
    if (!next.languagesIRead || !next.languagesIRead.length) next.languagesIRead = navLangs();
    live.state.settings = next;
    live.state.uiLang = next.cardLang && next.cardLang !== 'auto' ? next.cardLang : live.state.current;
    draw(live.host, live.state, live.handlers);
  });
}

export function init() {
  run().catch(e => debug.error('run crashed', e));
}

watchSettings();
init();
