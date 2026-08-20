(() => {
  function currentLang(loc) {
    const label = (loc.hostname || "").split(".")[0];
    if (!label || label === "www" || label === "wikipedia") return null;
    return label;
  }
  function currentTitle(loc, doc) {
    const canon = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
    let path = loc.pathname;
    try {
      if (canon) path = new URL(canon, loc.origin).pathname;
    } catch {
    }
    const m = path.match(/\/wiki\/(.+)$/);
    if (!m) return null;
    return decodeURIComponent(m[1]).replace(/_/g, " ");
  }
  function isMainPage(loc, doc) {
    const logo = doc.querySelector(".mw-logo-link, a.mw-logo, #p-logo a");
    const href = logo?.getAttribute("href");
    if (!href) return false;
    try {
      return decodeURIComponent(new URL(href, loc.origin).pathname) === decodeURIComponent(loc.pathname);
    } catch {
      return false;
    }
  }
  function getContext(loc, doc) {
    const lang = currentLang(loc);
    if (!lang) return null;
    if (!doc.body || !doc.body.classList.contains("ns-0")) return null;
    if (isMainPage(loc, doc)) return null;
    const title = currentTitle(loc, doc);
    if (!title) return null;
    return { lang, title };
  }

  var NODE = typeof window === "undefined";
  var VERSION = NODE ? process.env.npm_package_version || "1.0.0" : globalThis.chrome?.runtime?.getManifest?.().version || "1.0.0";
  var UA = `Wikiweigher/${VERSION} (https://github.com/intactdots/wikiweigher; Wikipedia language ranker)`;
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function fetchJson(url, tries = 4, timeoutMs = 15e3) {
    for (let t2 = 0; t2 < tries; t2++) {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), timeoutMs);
        const opts = { signal: ctrl.signal, credentials: "omit" };
        if (NODE) opts.headers = { "User-Agent": UA };
        const res = await fetch(url, opts);
        clearTimeout(to);
        if (res.status === 429) {
          await sleep(1e3 * (t2 + 1));
          continue;
        }
        if (!res.ok) throw new Error("http " + res.status);
        const body = await res.json();
        if (body && body.error) throw new Error("api " + (body.error.code || "error"));
        return body;
      } catch {
        if (t2 === tries - 1) return null;
        await sleep(500 * (t2 + 1));
      }
    }
    return null;
  }
  async function pool(items, n, fn) {
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

  function langlinksUrl(lang, title) {
    return `https://${lang}.wikipedia.org/w/api.php?action=query&prop=langlinks&llprop=url&lllimit=500&redirects=1&format=json&maxlag=5&origin=*&titles=${encodeURIComponent(title)}`;
  }
  async function getLanguages(lang, title, deps = {}) {
    const fetchJson2 = deps.fetchJson || fetchJson;
    const j = await fetchJson2(langlinksUrl(lang, title));
    if (!j) return null;
    const pages = j?.query?.pages || {};
    const page = Object.values(pages)[0];
    const out = [{ lang, title: page?.title || title, site: lang + ".wikipedia.org" }];
    for (const ll of page?.langlinks || []) {
      let site = ll.lang + ".wikipedia.org";
      if (ll.url) {
        try {
          const host = new URL(ll.url).host;
          if (host.endsWith(".wikipedia.org")) site = host;
        } catch {
        }
      }
      out.push({ lang: ll.lang, title: ll["*"], site });
    }
    return out;
  }

  var DROP = "ol.references, .reflist, .references, .refbegin, .infobox, table, .navbox, .sidebar, .thumb, figure, figcaption, .hatnote, .mw-editsection, sup.reference, style, .noprint, .metadata, .mw-empty-elt, .gallery, .quotebox";
  function extractProse(doc) {
    const root = doc.querySelector(".mw-parser-output") || doc.body;
    if (!root) return "";
    const clone2 = root.cloneNode(true);
    clone2.querySelectorAll(DROP).forEach((n) => n.remove());
    const out = [];
    clone2.querySelectorAll("p").forEach((p) => {
      const t2 = p.textContent.replace(/\s+/g, " ").trim();
      if (t2) out.push(t2);
    });
    return out.join(" ");
  }
  function countRefs(doc) {
    const root = doc.querySelector(".mw-parser-output") || doc.body || doc;
    let n = root.querySelectorAll("ol.references > li").length;
    if (!n) n = root.querySelectorAll(".reflist li").length;
    if (!n) n = root.querySelectorAll(".references li").length;
    return n;
  }
  function structure(doc) {
    const root = doc.querySelector(".mw-parser-output") || doc.body || doc;
    return {
      sections: root.querySelectorAll("h2, h3").length,
      images: root.querySelectorAll("img").length,
      tables: root.querySelectorAll("table").length
    };
  }

  var CJK_FACTOR = 0.5;
  var CJK = new RegExp("[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u3040-\\u30FF]", "g");
  function countWords(text) {
    if (!text) return 0;
    const cjk = (text.match(CJK) || []).length;
    const latin = (text.replace(CJK, " ").match(/\S+/g) || []).length;
    return latin + Math.round(cjk * CJK_FACTOR);
  }

  function parseHtmlUrl(site, title) {
    return `https://${site}/w/api.php?action=parse&prop=text&redirects=1&format=json&maxlag=5&origin=*&page=${encodeURIComponent(title)}`;
  }
  function infoUrl(site, title) {
    return `https://${site}/w/api.php?action=query&prop=info&redirects=1&format=json&maxlag=5&origin=*&titles=${encodeURIComponent(title)}`;
  }
  function defaultParse(html) {
    return new DOMParser().parseFromString(html, "text/html");
  }
  async function getQuickSize(site, title, deps = {}) {
    const fetchJson2 = deps.fetchJson || fetchJson;
    const j = await fetchJson2(infoUrl(site, title), 2);
    const page = Object.values(j?.query?.pages || {})[0];
    return page?.length || 0;
  }
  async function getExact(site, title, deps = {}) {
    const fetchJson2 = deps.fetchJson || fetchJson;
    const parse = deps.parse || defaultParse;
    const j = await fetchJson2(parseHtmlUrl(site, title), 4, 25e3);
    const html = j?.parse?.text?.["*"];
    if (!html) return null;
    const doc = parse(html);
    const s = structure(doc);
    return { words: countWords(extractProse(doc)), refs: countRefs(doc), sections: s.sections, images: s.images, tables: s.tables };
  }

  function norm(vals) {
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    return (v2) => hi === lo ? 0.5 : (v2 - lo) / (hi - lo);
  }
  var QUALITY = { featured: 0.05, good: 0.025 };
  function score(langs, opts = {}) {
    const weight = opts.weight ?? 0.5;
    const margin = opts.margin ?? 0.1;
    const current = opts.currentLang;
    const D = (l) => l.depth ?? l.words;
    const S = (l) => (l.sections || 0) + 0.5 * (l.images || 0);
    const nd = norm(langs.map(D));
    const nr = norm(langs.map((l) => l.refs));
    const ns = norm(langs.map(S));
    const ranked = langs.map((l) => {
      const base = weight * nd(D(l)) + (1 - weight) * nr(l.refs);
      const structureBonus = 0.05 * ns(S(l));
      return { ...l, score: (base + structureBonus) * (1 + (QUALITY[l.badge] || 0)) };
    }).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const bestSourced = [...ranked].sort((a, b) => b.refs - a.refs)[0];
    const cur = ranked.find((l) => l.lang === current);
    let type = "stay";
    let gain = 0;
    let drivers = { depth: 0, refs: 0, quality: 0 };
    if (cur && best.lang !== current) {
      const depthGain = (D(best) - D(cur)) / Math.max(D(cur), 1);
      const refsGain = (best.refs - cur.refs) / Math.max(cur.refs, 1);
      const qualGain = (QUALITY[best.badge] || 0) - (QUALITY[cur.badge] || 0);
      gain = weight * depthGain + (1 - weight) * refsGain + qualGain;
      drivers = { depth: weight * depthGain, refs: (1 - weight) * refsGain, quality: qualGain };
      if (gain >= margin) type = "switch";
    }
    return {
      ranked,
      best,
      bestSourced,
      verdict: { type, target: best.lang, deltaPct: Math.round(gain * 100), drivers }
    };
  }

  var FACTORS = {
    vi: 1.35,
    ja: 1.25,
    hi: 1.22,
    fr: 1.12,
    nl: 1.12,
    es: 1.1,
    it: 1.09,
    pt: 1.08,
    ro: 1.08,
    ca: 1.05,
    gl: 1.1,
    oc: 1.1,
    da: 1.03,
    bg: 1.01,
    no: 1,
    el: 1,
    nn: 0.97,
    is: 0.97,
    af: 0.97,
    de: 0.97,
    sv: 0.96,
    id: 0.94,
    ru: 0.92,
    pl: 0.91,
    fa: 0.9,
    uk: 0.9,
    ur: 0.9,
    be: 0.9,
    mk: 0.9,
    zh: 0.88,
    hu: 0.88,
    sl: 0.88,
    sr: 0.87,
    cs: 0.86,
    sk: 0.86,
    hr: 0.86,
    lt: 0.84,
    fi: 0.8,
    et: 0.8,
    lv: 0.8,
    az: 0.8,
    kk: 0.8,
    tr: 0.78,
    ar: 0.77,
    he: 0.73,
    ko: 0.7
  };
  function verbosity(lang) {
    return FACTORS[lang] || 1;
  }
  function calibratedDepth(lang, words) {
    return words / verbosity(lang);
  }

  function buildModel(state) {
    const cap = Math.max(1, state.settings.analyze || 12);
    const analyzed = [];
    const estimated = [];
    for (const l of state.langs) {
      const ex = state.exact[l.lang];
      if (ex) analyzed.push({ lang: l.lang, words: ex.words, refs: ex.refs, depth: calibratedDepth(l.lang, ex.words), sections: ex.sections, images: ex.images, badge: l.badge });
      else estimated.push({ lang: l.lang, size: state.sizes[l.lang] || 0 });
    }
    let ranked = [];
    let best = null;
    let bestSourced = null;
    let verdict = { type: "stay", target: state.current, deltaPct: 0 };
    if (analyzed.length >= 1) {
      const s = score(analyzed, { weight: state.settings.weight, currentLang: state.current });
      best = s.best;
      bestSourced = s.bestSourced;
      verdict = s.verdict;
      ranked = s.ranked.map((r) => ({ ...r, estimated: false }));
    } else if (estimated.length >= 1) {
      const s = score(estimated.map((e) => ({ lang: e.lang, words: e.size, refs: 0 })), { weight: 1, currentLang: state.current });
      best = s.best;
      verdict = s.verdict;
      ranked = s.ranked.map((r) => ({ lang: r.lang, words: null, refs: null, score: r.score, estimated: true }));
    }
    ranked = ranked.slice(0, cap);
    return {
      state: state.state,
      error: state.error || null,
      current: state.current,
      ranked,
      best,
      bestSourced,
      verdict,
      settings: state.settings,
      minimized: state.minimized,
      total: state.total,
      shown: (state.langs || []).length,
      uiLang: state.uiLang
    };
  }

  var ACCENTS = {
    blue: "#0078d4",
    indigo: "#635bff",
    violet: "#7c5cff",
    teal: "#12a594",
    green: "#1f9a3c",
    amber: "#e5920a",
    rose: "#e5484d"
  };
  function accentHex(name) {
    return ACCENTS[name] || ACCENTS.blue;
  }

  var CARD_LANGS = ["en", "de", "fr", "es", "it", "pt", "nl", "sv", "ru", "uk", "pl", "tr", "id", "vi", "ja", "zh", "ko", "ar", "fa", "hi"];
  var SCHEMA = {
    weight: { type: "number", def: 0.5, min: 0, max: 1 },
    analyze: { type: "enum", def: 12, values: [6, 12, 24] },
    theme: { type: "enum", def: "auto", values: ["auto", "light", "dark"] },
    accent: { type: "enum", def: "blue", values: Object.keys(ACCENTS) },
    cardLang: { type: "enum", def: "auto", values: ["auto", ...CARD_LANGS] },
    enabled: { type: "boolean", def: true },
    languagesIRead: { type: "codes", def: [], max: 20 }
  };
  var CODE = /^[a-z]{2,3}$/;
  function clone(v2) {
    if (Array.isArray(v2)) return v2.slice();
    if (v2 && typeof v2 === "object") return { ...v2 };
    return v2;
  }
  function codes(value, max) {
    if (!Array.isArray(value)) return null;
    const out = [];
    for (const raw of value) {
      if (typeof raw !== "string") continue;
      const code = raw.trim().toLowerCase().split("-")[0];
      if (CODE.test(code) && !out.includes(code)) out.push(code);
    }
    return out.slice(0, max);
  }
  function point(value) {
    if (!value || typeof value !== "object") return null;
    const top = Number(value.top);
    const left = Number(value.left);
    if (!Number.isFinite(top) || !Number.isFinite(left)) return null;
    return { top: Math.max(0, top), left: Math.max(0, left) };
  }
  function coerce(def, value) {
    const fallback = clone(def.def);
    switch (def.type) {
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
        return Math.min(def.max, Math.max(def.min, value));
      case "enum":
        return def.values.includes(value) ? value : fallback;
      case "boolean":
        return typeof value === "boolean" ? value : fallback;
      case "codes": {
        const list = codes(value, def.max);
        return list === null ? fallback : list;
      }
      case "point":
        return point(value);
      default:
        return fallback;
    }
  }
  function validatorFor(table) {
    const defaults = Object.fromEntries(Object.entries(table).map(([k, d]) => [k, clone(d.def)]));
    return {
      DEFAULTS: defaults,
      validate(key2, value) {
        return table[key2] ? coerce(table[key2], value) : void 0;
      },
      validateAll(obj) {
        const src = obj && typeof obj === "object" ? obj : {};
        const out = {};
        for (const key2 of Object.keys(table)) out[key2] = coerce(table[key2], src[key2]);
        return out;
      }
    };
  }
  var settingsValidator = validatorFor(SCHEMA);
  var DEFAULTS = settingsValidator.DEFAULTS;
  var validate = settingsValidator.validate;
  var validateAll = settingsValidator.validateAll;

  async function getSettings(store3) {
    let raw = null;
    try {
      raw = (await store3.get("settings"))?.settings;
    } catch {
      raw = null;
    }
    return validateAll(raw);
  }

  var LAYOUT_KEY = "wikiweigherLayout";
  var LAYOUT_SCHEMA = {
    position: { type: "point", def: null },
    startMinimized: { type: "boolean", def: false }
  };
  var v = validatorFor(LAYOUT_SCHEMA);
  var LAYOUT_DEFAULTS = v.DEFAULTS;
  function clampToViewport(pos, width, height) {
    if (!pos) return null;
    const maxTop = Math.max(0, height - 60);
    const maxLeft = Math.max(0, width - 60);
    return { top: Math.min(maxTop, Math.max(0, pos.top)), left: Math.min(maxLeft, Math.max(0, pos.left)) };
  }
  async function getLayout(store3) {
    let raw = null;
    try {
      raw = (await store3.get(LAYOUT_KEY))?.[LAYOUT_KEY];
    } catch {
      raw = null;
    }
    return v.validateAll(raw);
  }
  async function setLayout(patch, store3) {
    const next = v.validateAll({ ...await getLayout(store3), ...patch || {} });
    try {
      await store3.set({ [LAYOUT_KEY]: next });
    } catch {
      return next;
    }
    return next;
  }

  var layout = validatorFor(LAYOUT_SCHEMA);
  var VERSION2 = 1;
  var VERSION_KEY = "wikiweigherSchema";
  function stepToV1(legacySettings) {
    const src = legacySettings && typeof legacySettings === "object" ? legacySettings : {};
    return {
      settings: validateAll(src),
      layout: layout.validateAll({ position: src.position, startMinimized: src.startMinimized })
    };
  }
  async function migrate(store3) {
    let current = 0;
    let legacy = null;
    try {
      const obj = await store3.get([VERSION_KEY, "settings"]);
      current = Number(obj?.[VERSION_KEY]) || 0;
      legacy = obj?.settings || null;
    } catch {
      return { from: 0, to: 0, ran: false };
    }
    if (current >= VERSION2) return { from: current, to: current, ran: false };
    const next = stepToV1(legacy);
    try {
      await store3.set({ settings: next.settings, [LAYOUT_KEY]: next.layout, [VERSION_KEY]: VERSION2 });
    } catch {
      return { from: current, to: current, ran: false };
    }
    return { from: current, to: VERSION2, ran: true };
  }

  var PREFIX = "wwc:";
  var MAX_BYTES = 2 * 1024 * 1024;
  async function evictIfFull(store3) {
    if (!store3 || typeof store3.getBytesInUse !== "function" || typeof store3.remove !== "function") return 0;
    let bytes = 0;
    try {
      bytes = await store3.getBytesInUse(null);
    } catch {
      return 0;
    }
    if (!(bytes >= MAX_BYTES)) return 0;
    try {
      const all = await store3.get(null);
      const keys = Object.keys(all || {}).filter((k) => k.startsWith(PREFIX));
      if (keys.length) await store3.remove(keys);
      return keys.length;
    } catch {
      return 0;
    }
  }
  async function getCached(key2, store3) {
    const full = PREFIX + key2;
    let entry = null;
    try {
      entry = (await store3.get(full))?.[full];
    } catch {
      return null;
    }
    if (!entry) return null;
    if (entry.expires && entry.expires < Date.now()) {
      store3.remove?.(full);
      return null;
    }
    return entry.data;
  }
  async function setCached(key2, data, ttlMs, store3) {
    await evictIfFull(store3);
    try {
      await store3.set({ [PREFIX + key2]: { data, expires: Date.now() + ttlMs } });
    } catch {
      return false;
    }
    return true;
  }

  var STYLES = `
.cx-card, .cx-pill {
  font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: -0.05px; box-sizing: border-box;
  --cx-acc: #0078d4;
  --cv:#ffffff; --s1:#f5f6f8; --s2:#eceef1; --ink:#14161b; --imut:#2b3038; --mut:#666c76; --sub:#969ca6;
  --line:#e3e5ea; --line2:#cfd2d9; --ok:#1f9a3c; --warn:#b3781c;
  --acc2: color-mix(in srgb, var(--cx-acc), #000000 6%);
  --acc-soft: color-mix(in srgb, var(--cx-acc) 12%, transparent);
  --acc-line: color-mix(in srgb, var(--cx-acc) 38%, transparent);
  --shadow: 0 10px 34px rgba(15,18,26,.16), 0 2px 8px rgba(15,18,26,.08);
}
@media (prefers-color-scheme: dark) {
  .cx-card:not([data-theme="light"]), .cx-pill:not([data-theme="light"]) {
    --cv:#0f1011; --s1:#141516; --s2:#18191a; --ink:#f7f8f8; --imut:#d0d6e0; --mut:#8a8f98; --sub:#62666d;
    --line:#23252a; --line2:#34343a; --ok:#27a644; --warn:#e5a33d;
    --acc2: color-mix(in srgb, var(--cx-acc), #ffffff 45%);
    --shadow: 0 16px 44px rgba(0,0,0,.55), 0 2px 10px rgba(0,0,0,.45);
  }
}
.cx-card[data-theme="dark"], .cx-pill[data-theme="dark"] {
  --cv:#0f1011; --s1:#141516; --s2:#18191a; --ink:#f7f8f8; --imut:#d0d6e0; --mut:#8a8f98; --sub:#62666d;
  --line:#23252a; --line2:#34343a; --ok:#27a644; --warn:#e5a33d;
  --acc2: color-mix(in srgb, var(--cx-acc), #ffffff 45%);
  --shadow: 0 16px 44px rgba(0,0,0,.55), 0 2px 10px rgba(0,0,0,.45);
}
.cx-card * { box-sizing: border-box; }
.cx-card { width: 306px; background:var(--cv); color:var(--ink); border:1px solid var(--line); border-radius:14px; overflow:hidden; box-shadow:var(--shadow); font-size:13px; }
.cx-head { display:flex; align-items:center; gap:8px; padding:11px 13px; background:var(--s1); border-bottom:1px solid var(--line); cursor:grab; user-select:none; touch-action:none; }
.cx-head:active { cursor:grabbing; }
.cx-head-title { display:inline-flex; align-items:center; gap:7px; font-weight:600; font-size:13px; letter-spacing:-0.2px; }
.cx-head-title svg { color:var(--cx-acc); }
.cx-spacer { flex:1; }
.cx-icon-btn { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; padding:0; border:none; background:none; color:var(--sub); cursor:pointer; border-radius:6px; }
.cx-icon-btn:hover { background:var(--s2); color:var(--ink); }
.cx-best { padding:14px 15px; border-bottom:1px solid var(--line); }
.cx-best-label { font-size:10px; letter-spacing:.5px; text-transform:uppercase; color:var(--cx-acc); font-weight:700; }
.cx-best-main { display:flex; align-items:baseline; gap:7px; margin-top:5px; flex-wrap:wrap; }
.cx-best-name { font-size:17px; font-weight:650; letter-spacing:-0.3px; color:var(--ink); }
.cx-best-en { font-size:11px; color:var(--sub); }
.cx-open { display:inline-flex; align-items:center; gap:4px; border:none; background:none; color:var(--cx-acc); cursor:pointer; font-size:12px; font-weight:600; padding:0; font-family:inherit; }
.cx-open svg { width:13px; height:13px; }
.cx-best-reason { font-size:11.5px; color:var(--mut); margin-top:5px; }
.cx-translate { display:inline-flex; align-items:center; gap:6px; margin-top:11px; padding:6px 11px; border:1px solid var(--line2); background:var(--cv); color:var(--cx-acc); border-radius:8px; cursor:pointer; font-size:11.5px; font-weight:500; font-family:inherit; }
.cx-translate:hover { background:var(--s1); }
.cx-translate svg { width:13px; height:13px; }
.cx-sourced { display:flex; align-items:center; gap:7px; margin-top:12px; padding:9px 11px; border-radius:9px; background:var(--acc-soft); flex-wrap:wrap; }
.cx-sourced-icon { display:inline-flex; color:var(--cx-acc); }
.cx-sourced-icon svg { width:13px; height:13px; }
.cx-sourced-label { font-size:9.5px; letter-spacing:.5px; text-transform:uppercase; color:var(--mut); font-weight:700; }
.cx-sourced-link { display:inline-flex; align-items:center; gap:4px; border:none; background:none; color:var(--acc2); cursor:pointer; font-size:12px; padding:0; font-family:inherit; font-weight:650; }
.cx-sourced-link svg { width:12px; height:12px; }
.cx-loading { padding:16px 15px; color:var(--mut); font-size:12px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:9px; }
.cx-loading::before { content:""; width:13px; height:13px; border-radius:50%; border:2px solid var(--line2); border-top-color:var(--cx-acc); animation:cxspin .7s linear infinite; flex:none; }
@keyframes cxspin { to { transform:rotate(360deg); } }
.cx-colhead { display:flex; align-items:center; padding:10px 14px 4px; font-size:9.5px; letter-spacing:.5px; text-transform:uppercase; color:var(--sub); font-weight:600; }
.cx-colhead-stat { width:82px; text-align:right; }
.cx-rows { padding:8px 8px 10px 14px; display:flex; flex-direction:column; gap:2px; max-height:236px; overflow-y:auto; overflow-x:hidden; scrollbar-width:thin; scrollbar-color:var(--line2) transparent; }
.cx-rows::-webkit-scrollbar { width:8px; }
.cx-rows::-webkit-scrollbar-track { background:transparent; }
.cx-rows::-webkit-scrollbar-thumb { background:var(--line2); border-radius:10px; border:2px solid transparent; background-clip:padding-box; }
.cx-rows::-webkit-scrollbar-thumb:hover { background:var(--mut); background-clip:padding-box; }
.cx-row { display:flex; align-items:center; gap:9px; border:none; background:none; padding:6px 6px; margin:0 6px 0 0; border-radius:8px; cursor:pointer; text-align:left; color:inherit; font:inherit; }
.cx-row:hover { background:var(--s1); }
.cx-row-name { width:104px; display:flex; align-items:center; gap:6px; overflow:hidden; font-size:12px; color:var(--imut); }
.cx-name-text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cx-you { font-size:9px; font-weight:600; background:var(--acc-soft); color:var(--acc2); border-radius:4px; padding:1px 5px; flex:none; text-transform:uppercase; letter-spacing:.3px; }
.cx-badge { font-size:11px; flex:none; line-height:1; }
.cx-badge-featured { color:#eab308; }
.cx-badge-good { color:var(--sub); }
.cx-bar { flex:1; height:6px; background:var(--s2); border-radius:4px; overflow:hidden; }
.cx-bar-fill { display:block; height:100%; background:var(--cx-acc); border-radius:4px; }
.cx-row.cx-current { background:var(--acc-soft); }
.cx-row.cx-top .cx-bar-fill { background:var(--cx-acc); }
.cx-row-stat { width:82px; text-align:right; font-size:11px; color:var(--mut); flex:none; font-variant-numeric:tabular-nums; }
.cx-row:hover .cx-row-name { color:var(--cx-acc); }
.cx-card :focus-visible, .cx-pill:focus-visible { outline:2px solid var(--cx-acc); outline-offset:2px; border-radius:7px; }
@media (prefers-reduced-motion: reduce) {
  .cx-loading::before { animation:none; opacity:.55; }
  .cx-card, .cx-pill, .cx-row, .cx-open, .cx-translate, .cx-error-btn { transition:none !important; }
}
@media (forced-colors: active) {
  .cx-card, .cx-pill { border:1px solid CanvasText; }
  .cx-bar-fill { background:Highlight; }
}
.cx-error { padding:14px 15px 13px; border-bottom:1px solid var(--line); }
.cx-error-head { display:flex; align-items:center; gap:8px; color:var(--warn); font-size:12px; font-weight:600; }
.cx-error-msg { margin:7px 0 11px; color:var(--imut); font-size:12px; line-height:1.5; }
.cx-error-acts { display:flex; gap:8px; }
.cx-error-btn { border:1px solid var(--line2); background:var(--s2); color:var(--imut); cursor:pointer; font-size:11.5px; font-weight:600; padding:6px 12px; font-family:inherit; border-radius:7px; }
.cx-error-btn:hover { background:var(--s1); border-color:var(--cx-acc); }
.cx-error-btn.cx-error-pri { background:var(--cx-acc); border-color:var(--cx-acc); color:#fff; }
.cx-error-btn.cx-error-pri:hover { filter:brightness(1.1); }
.cx-rate { display:flex; align-items:center; gap:7px; margin:2px 10px 8px; padding:8px 10px; border-radius:9px; background:var(--acc-soft); font-size:11.5px; }
.cx-rate-star { color:var(--cx-acc); font-size:12px; }
.cx-rate-text { flex:1; color:var(--imut); font-weight:500; }
.cx-rate-btn { border:none; background:none; color:var(--acc2); cursor:pointer; font-size:11.5px; font-weight:600; padding:2px 4px; font-family:inherit; border-radius:5px; }
.cx-rate-btn:hover { background:var(--s2); }
.cx-rate-btn.cx-rate-pri { color:var(--cx-acc); }
.cx-rate-x { width:20px; height:20px; }
.cx-foot { display:flex; align-items:center; gap:6px; padding:9px 14px; border-top:1px solid var(--line); background:var(--s1); }
.cx-foot-note { font-size:10px; color:var(--sub); }
.cx-pill { display:inline-flex; align-items:center; gap:8px; background:var(--s1); border:1px solid var(--line); border-radius:20px; padding:8px 14px; cursor:grab; color:var(--ink); box-shadow:var(--shadow); font-size:12px; font-weight:500; user-select:none; touch-action:none; }
.cx-pill:active { cursor:grabbing; }
.cx-pill svg { color:var(--cx-acc); width:15px; height:15px; }
`;

  var svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true">${p}</svg>`;
  var ICONS = {
    world: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18"/>'),
    minus: svg('<path d="M5 12h14"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    external: svg('<path d="M14 5h5v5M19 5l-8 8M19 13v6H5V5h6"/>'),
    chevronUp: svg('<path d="M6 15l6-6 6 6"/>'),
    translate: svg('<path d="M4 5h7M8 4v1c0 4-2 7-5 9M5 9c0 3 3 5 6 6M13 20l4-9 4 9M14.5 17h5"/>'),
    bookmark: svg('<path d="M6 3h12v18l-6-4-6 4V3z"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>'),
    warn: svg('<path d="M12 4.5 2.5 20h19L12 4.5z"/><path d="M12 10v4M12 17.2v.01"/>')
  };

  function safe(locale, code) {
    try {
      return new Intl.DisplayNames([locale], { type: "language" }).of(code) || code;
    } catch {
      return code;
    }
  }
  function nativeName(code) {
    return safe(code, code);
  }
  function englishName(code) {
    return safe("en", code);
  }

  var STR = {
    en: { bestOverall: "Best overall", amongBestSub: "No other language is clearly more complete.", open: "Open", translate: "Read it translated", ranking: "Ranking languages\u2026", finding: "Finding other languages\u2026", language: "language", wordsRefs: "words \xB7 refs", metric: "adjusted prose words + references", sharpening: "estimated - sharpening\u2026", here: "here", best: "Best", words: "words", refsWord: "refs", bestSourcedLabel: "Best sourced", featured: "Featured article", good: "Good article", minimize: "Minimize", close: "Close", settings: "Settings", openApp: "Open Wikiweigher", current: "current", langsOf: "in {total} languages", enjoying: "Enjoying Wikiweigher?", rateIt: "Rate it", later: "Later", noThanks: "No thanks", errorTitle: "Something went wrong", errNetwork: "Could not reach Wikipedia. Check your connection and try again.", errTimeout: "Wikipedia took too long to answer. It may be busy right now.", errUnknown: "Wikiweigher hit an unexpected problem.", retry: "Try again", reportBug: "Report", errOffline: "You appear to be offline. Reconnect and try again." },
    de: { enjoying: "Gef\xE4llt dir Wikiweigher?", rateIt: "Bewerten", later: "Sp\xE4ter", noThanks: "Nein danke", bestOverall: "Insgesamt am besten", amongBestSub: "Keine andere Sprache ist deutlich vollst\xE4ndiger.", open: "\xD6ffnen", translate: "\xDCbersetzt lesen", ranking: "Sprachen werden sortiert\u2026", finding: "Andere Sprachen werden gesucht\u2026", language: "Sprache", wordsRefs: "W\xF6rter \xB7 Belege", metric: "angepasste Flie\xDFtext-W\xF6rter + Belege", sharpening: "gesch\xE4tzt - wird verfeinert\u2026", here: "hier", best: "Beste", words: "W\xF6rter", refsWord: "Belege", bestSourcedLabel: "Am besten belegt", featured: "Exzellenter Artikel", good: "Lesenswerter Artikel", minimize: "Minimieren", close: "Schlie\xDFen", settings: "Einstellungen", openApp: "Wikiweigher \xF6ffnen", current: "aktuell", langsOf: "in {total} Sprachen", errorTitle: "Etwas ist schiefgelaufen", errNetwork: "Wikipedia ist nicht erreichbar. Pr\xFCfe deine Verbindung und versuche es erneut.", errTimeout: "Wikipedia hat zu lange gebraucht. Der Server ist vielleicht gerade ausgelastet.", errUnknown: "Wikiweigher hat ein unerwartetes Problem.", retry: "Erneut versuchen", reportBug: "Melden", errOffline: "Du scheinst offline zu sein. Stelle die Verbindung wieder her und versuche es erneut." },
    fr: { enjoying: "Wikiweigher vous pla\xEEt ?", rateIt: "Noter", later: "Plus tard", noThanks: "Non merci", bestOverall: "Globalement le meilleur", amongBestSub: "Aucune autre langue n\u2019est nettement plus compl\xE8te.", open: "Ouvrir", translate: "Lire traduit", ranking: "Classement des langues\u2026", finding: "Recherche d\u2019autres langues\u2026", language: "langue", wordsRefs: "mots \xB7 r\xE9f.", metric: "mots de texte ajust\xE9s + r\xE9f\xE9rences", sharpening: "estim\xE9 - affinage\u2026", here: "ici", best: "Meilleur", words: "mots", refsWord: "r\xE9f.", bestSourcedLabel: "Mieux sourc\xE9", featured: "Article de qualit\xE9", good: "Bon article", minimize: "R\xE9duire", close: "Fermer", settings: "Param\xE8tres", openApp: "Ouvrir Wikiweigher", current: "actuel", langsOf: "en {total} langues", errorTitle: "Une erreur est survenue", errNetwork: "Wikip\xE9dia est injoignable. V\xE9rifiez votre connexion et r\xE9essayez.", errTimeout: "Wikip\xE9dia a mis trop de temps \xE0 r\xE9pondre. Le serveur est peut-\xEAtre occup\xE9.", errUnknown: "Wikiweigher a rencontr\xE9 un probl\xE8me inattendu.", retry: "R\xE9essayer", reportBug: "Signaler", errOffline: "Vous semblez hors ligne. Reconnectez-vous et r\xE9essayez." },
    es: { enjoying: "\xBFTe gusta Wikiweigher?", rateIt: "Valorar", later: "M\xE1s tarde", noThanks: "No, gracias", bestOverall: "Mejor en general", amongBestSub: "Ning\xFAn otro idioma es claramente m\xE1s completo.", open: "Abrir", translate: "Leer traducido", ranking: "Ordenando idiomas\u2026", finding: "Buscando otros idiomas\u2026", language: "idioma", wordsRefs: "palabras \xB7 ref.", metric: "palabras de texto ajustadas + referencias", sharpening: "estimado - afinando\u2026", here: "aqu\xED", best: "Mejor", words: "palabras", refsWord: "ref.", bestSourcedLabel: "Mejor referenciado", featured: "Art\xEDculo destacado", good: "Art\xEDculo bueno", minimize: "Minimizar", close: "Cerrar", settings: "Ajustes", openApp: "Abrir Wikiweigher", current: "actual", langsOf: "en {total} idiomas", errorTitle: "Algo sali\xF3 mal", errNetwork: "No se pudo conectar con Wikipedia. Revisa tu conexi\xF3n e int\xE9ntalo de nuevo.", errTimeout: "Wikipedia tard\xF3 demasiado en responder. Puede estar saturada.", errUnknown: "Wikiweigher encontr\xF3 un problema inesperado.", retry: "Reintentar", reportBug: "Informar", errOffline: "Parece que no tienes conexi\xF3n. Recon\xE9ctate e int\xE9ntalo de nuevo." },
    it: { enjoying: "Ti piace Wikiweigher?", rateIt: "Valuta", later: "Pi\xF9 tardi", noThanks: "No, grazie", bestOverall: "Migliore in assoluto", amongBestSub: "Nessun\u2019altra lingua \xE8 chiaramente pi\xF9 completa.", open: "Apri", translate: "Leggi tradotto", ranking: "Ordinamento lingue\u2026", finding: "Ricerca altre lingue\u2026", language: "lingua", wordsRefs: "parole \xB7 rif.", metric: "parole di testo adattate + riferimenti", sharpening: "stimato - affinamento\u2026", here: "qui", best: "Migliore", words: "parole", refsWord: "rif.", bestSourcedLabel: "Meglio documentato", featured: "Voce in vetrina", good: "Voce di qualit\xE0", minimize: "Riduci", close: "Chiudi", settings: "Impostazioni", openApp: "Apri Wikiweigher", current: "attuale", langsOf: "in {total} lingue", errorTitle: "Qualcosa \xE8 andato storto", errNetwork: "Impossibile raggiungere Wikipedia. Controlla la connessione e riprova.", errTimeout: "Wikipedia ha impiegato troppo tempo a rispondere. Potrebbe essere sovraccarica.", errUnknown: "Wikiweigher ha riscontrato un problema imprevisto.", retry: "Riprova", reportBug: "Segnala", errOffline: "Sembra che tu sia offline. Riconnettiti e riprova." },
    pt: { enjoying: "Est\xE1 gostando do Wikiweigher?", rateIt: "Avaliar", later: "Mais tarde", noThanks: "N\xE3o, obrigado", bestOverall: "Melhor no geral", amongBestSub: "Nenhum outro idioma \xE9 claramente mais completo.", open: "Abrir", translate: "Ler traduzido", ranking: "Classificando idiomas\u2026", finding: "Procurando outros idiomas\u2026", language: "idioma", wordsRefs: "palavras \xB7 ref.", metric: "palavras de texto ajustadas + refer\xEAncias", sharpening: "estimado - refinando\u2026", here: "aqui", best: "Melhor", words: "palavras", refsWord: "ref.", bestSourcedLabel: "Melhor referenciado", featured: "Artigo destacado", good: "Artigo bom", minimize: "Minimizar", close: "Fechar", settings: "Configura\xE7\xF5es", openApp: "Abrir Wikiweigher", current: "atual", langsOf: "em {total} idiomas", errorTitle: "Algo deu errado", errNetwork: "N\xE3o foi poss\xEDvel acessar a Wikip\xE9dia. Verifique sua conex\xE3o e tente de novo.", errTimeout: "A Wikip\xE9dia demorou demais para responder. Pode estar sobrecarregada.", errUnknown: "O Wikiweigher encontrou um problema inesperado.", retry: "Tentar de novo", reportBug: "Relatar", errOffline: "Voc\xEA parece estar sem conex\xE3o. Reconecte e tente de novo." },
    nl: { enjoying: "Bevalt Wikiweigher?", rateIt: "Beoordelen", later: "Later", noThanks: "Nee, bedankt", bestOverall: "Algeheel de beste", amongBestSub: "Geen andere taal is duidelijk vollediger.", open: "Openen", translate: "Vertaald lezen", ranking: "Talen rangschikken\u2026", finding: "Andere talen zoeken\u2026", language: "taal", wordsRefs: "woorden \xB7 ref.", metric: "gecorrigeerde tekstwoorden + bronnen", sharpening: "geschat - verfijnen\u2026", here: "hier", best: "Beste", words: "woorden", refsWord: "bronnen", bestSourcedLabel: "Best onderbouwd", featured: "Etalage-artikel", good: "Goed artikel", minimize: "Minimaliseren", close: "Sluiten", settings: "Instellingen", openApp: "Wikiweigher openen", current: "huidig", langsOf: "in {total} talen", errorTitle: "Er ging iets mis", errNetwork: "Wikipedia is niet bereikbaar. Controleer je verbinding en probeer het opnieuw.", errTimeout: "Wikipedia deed er te lang over. De server is misschien druk.", errUnknown: "Wikiweigher liep tegen een onverwacht probleem aan.", retry: "Opnieuw proberen", reportBug: "Melden", errOffline: "Je lijkt offline te zijn. Maak opnieuw verbinding en probeer het nog eens." },
    sv: { enjoying: "Gillar du Wikiweigher?", rateIt: "Betygs\xE4tt", later: "Senare", noThanks: "Nej tack", bestOverall: "B\xE4st totalt", amongBestSub: "Inget annat spr\xE5k \xE4r tydligt mer komplett.", open: "\xD6ppna", translate: "L\xE4s \xF6versatt", ranking: "Rangordnar spr\xE5k\u2026", finding: "S\xF6ker andra spr\xE5k\u2026", language: "spr\xE5k", wordsRefs: "ord \xB7 k\xE4llor", metric: "justerade br\xF6dtextord + k\xE4llor", sharpening: "uppskattat - finjusterar\u2026", here: "h\xE4r", best: "B\xE4st", words: "ord", refsWord: "k\xE4llor", bestSourcedLabel: "B\xE4st k\xE4llbelagd", featured: "Utm\xE4rkt artikel", good: "Bra artikel", minimize: "Minimera", close: "St\xE4ng", settings: "Inst\xE4llningar", openApp: "\xD6ppna Wikiweigher", current: "aktuell", langsOf: "p\xE5 {total} spr\xE5k", errorTitle: "N\xE5got gick fel", errNetwork: "Kunde inte n\xE5 Wikipedia. Kontrollera anslutningen och f\xF6rs\xF6k igen.", errTimeout: "Wikipedia svarade f\xF6r l\xE5ngsamt. Servern kan vara upptagen.", errUnknown: "Wikiweigher st\xF6tte p\xE5 ett ov\xE4ntat problem.", retry: "F\xF6rs\xF6k igen", reportBug: "Rapportera", errOffline: "Du verkar vara offline. Anslut igen och f\xF6rs\xF6k p\xE5 nytt." },
    ru: { enjoying: "\u041D\u0440\u0430\u0432\u0438\u0442\u0441\u044F Wikiweigher?", rateIt: "\u041E\u0446\u0435\u043D\u0438\u0442\u044C", later: "\u041F\u043E\u0437\u0436\u0435", noThanks: "\u041D\u0435\u0442, \u0441\u043F\u0430\u0441\u0438\u0431\u043E", bestOverall: "\u041B\u0443\u0447\u0448\u0430\u044F \u0432 \u0446\u0435\u043B\u043E\u043C", amongBestSub: "\u041D\u0438 \u043E\u0434\u0438\u043D \u0434\u0440\u0443\u0433\u043E\u0439 \u044F\u0437\u044B\u043A \u044F\u0432\u043D\u043E \u043D\u0435 \u043F\u043E\u043B\u043D\u0435\u0435.", open: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C", translate: "\u0427\u0438\u0442\u0430\u0442\u044C \u0432 \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u0435", ranking: "\u0421\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u043A\u0430 \u044F\u0437\u044B\u043A\u043E\u0432\u2026", finding: "\u041F\u043E\u0438\u0441\u043A \u0434\u0440\u0443\u0433\u0438\u0445 \u044F\u0437\u044B\u043A\u043E\u0432\u2026", language: "\u044F\u0437\u044B\u043A", wordsRefs: "\u0441\u043B\u043E\u0432 \xB7 \u0441\u043D\u043E\u0441\u043E\u043A", metric: "\u0441\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u0441\u043B\u043E\u0432 \u0442\u0435\u043A\u0441\u0442\u0430 + \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u043E\u0432", sharpening: "\u043E\u0446\u0435\u043D\u043A\u0430 - \u0443\u0442\u043E\u0447\u043D\u044F\u0435\u0442\u0441\u044F\u2026", here: "\u0437\u0434\u0435\u0441\u044C", best: "\u041B\u0443\u0447\u0448\u0438\u0439", words: "\u0441\u043B\u043E\u0432", refsWord: "\u0441\u043D\u043E\u0441\u043E\u043A", bestSourcedLabel: "\u0411\u043E\u043B\u044C\u0448\u0435 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u043E\u0432", featured: "\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u0430\u044F \u0441\u0442\u0430\u0442\u044C\u044F", good: "\u0425\u043E\u0440\u043E\u0448\u0430\u044F \u0441\u0442\u0430\u0442\u044C\u044F", minimize: "\u0421\u0432\u0435\u0440\u043D\u0443\u0442\u044C", close: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", settings: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438", openApp: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C Wikiweigher", current: "\u0442\u0435\u043A\u0443\u0449\u0438\u0439", langsOf: "\u043D\u0430 {total} \u044F\u0437\u044B\u043A\u0430\u0445", errorTitle: "\u0427\u0442\u043E-\u0442\u043E \u043F\u043E\u0448\u043B\u043E \u043D\u0435 \u0442\u0430\u043A", errNetwork: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u0432\u044F\u0437\u0430\u0442\u044C\u0441\u044F \u0441 \u0412\u0438\u043A\u0438\u043F\u0435\u0434\u0438\u0435\u0439. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438 \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430.", errTimeout: "\u0412\u0438\u043A\u0438\u043F\u0435\u0434\u0438\u044F \u043E\u0442\u0432\u0435\u0447\u0430\u043B\u0430 \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043E\u043B\u0433\u043E. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u0441\u0435\u0440\u0432\u0435\u0440 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D.", errUnknown: "\u0412 Wikiweigher \u043F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u0430 \u043D\u0435\u043F\u0440\u0435\u0434\u0432\u0438\u0434\u0435\u043D\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430.", retry: "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C", reportBug: "\u0421\u043E\u043E\u0431\u0449\u0438\u0442\u044C", errOffline: "\u041F\u043E\u0445\u043E\u0436\u0435, \u0432\u044B \u043D\u0435 \u0432 \u0441\u0435\u0442\u0438. \u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438 \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430." },
    uk: { enjoying: "\u041F\u043E\u0434\u043E\u0431\u0430\u0454\u0442\u044C\u0441\u044F Wikiweigher?", rateIt: "\u041E\u0446\u0456\u043D\u0438\u0442\u0438", later: "\u041F\u0456\u0437\u043D\u0456\u0448\u0435", noThanks: "\u041D\u0456, \u0434\u044F\u043A\u0443\u044E", bestOverall: "\u041D\u0430\u0439\u043A\u0440\u0430\u0449\u0430 \u0437\u0430\u0433\u0430\u043B\u043E\u043C", amongBestSub: "\u0416\u043E\u0434\u043D\u0430 \u0456\u043D\u0448\u0430 \u043C\u043E\u0432\u0430 \u043D\u0435 \u0454 \u043F\u043E\u043C\u0456\u0442\u043D\u043E \u043F\u043E\u0432\u043D\u0456\u0448\u043E\u044E.", open: "\u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0438", translate: "\u0427\u0438\u0442\u0430\u0442\u0438 \u0432 \u043F\u0435\u0440\u0435\u043A\u043B\u0430\u0434\u0456", ranking: "\u0423\u043F\u043E\u0440\u044F\u0434\u043A\u0443\u0432\u0430\u043D\u043D\u044F \u043C\u043E\u0432\u2026", finding: "\u041F\u043E\u0448\u0443\u043A \u0456\u043D\u0448\u0438\u0445 \u043C\u043E\u0432\u2026", language: "\u043C\u043E\u0432\u0430", wordsRefs: "\u0441\u043B\u0456\u0432 \xB7 \u0432\u0438\u043D\u043E\u0441\u043E\u043A", metric: "\u0441\u043A\u043E\u0440\u0438\u0433\u043E\u0432\u0430\u043D\u0438\u0445 \u0441\u043B\u0456\u0432 \u0442\u0435\u043A\u0441\u0442\u0443 + \u0434\u0436\u0435\u0440\u0435\u043B", sharpening: "\u043E\u0446\u0456\u043D\u043A\u0430 - \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u043D\u044F\u2026", here: "\u0442\u0443\u0442", best: "\u041D\u0430\u0439\u043A\u0440\u0430\u0449\u0430", words: "\u0441\u043B\u0456\u0432", refsWord: "\u0432\u0438\u043D\u043E\u0441\u043E\u043A", bestSourcedLabel: "\u0411\u0456\u043B\u044C\u0448\u0435 \u0434\u0436\u0435\u0440\u0435\u043B", featured: "\u0412\u0438\u0431\u0440\u0430\u043D\u0430 \u0441\u0442\u0430\u0442\u0442\u044F", good: "\u0414\u043E\u0431\u0440\u0430 \u0441\u0442\u0430\u0442\u0442\u044F", minimize: "\u0417\u0433\u043E\u0440\u043D\u0443\u0442\u0438", close: "\u0417\u0430\u043A\u0440\u0438\u0442\u0438", settings: "\u041D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F", openApp: "\u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0438 Wikiweigher", current: "\u043F\u043E\u0442\u043E\u0447\u043D\u0430", langsOf: "\u0443 {total} \u043C\u043E\u0432\u0430\u0445", errorTitle: "\u0429\u043E\u0441\u044C \u043F\u0456\u0448\u043B\u043E \u043D\u0435 \u0442\u0430\u043A", errNetwork: "\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0432\u02BC\u044F\u0437\u0430\u0442\u0438\u0441\u044F \u0437 \u0412\u0456\u043A\u0456\u043F\u0435\u0434\u0456\u0454\u044E. \u041F\u0435\u0440\u0435\u0432\u0456\u0440\u0442\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F \u0442\u0430 \u0441\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0449\u0435 \u0440\u0430\u0437.", errTimeout: "\u0412\u0456\u043A\u0456\u043F\u0435\u0434\u0456\u044F \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u043B\u0430 \u043D\u0430\u0434\u0442\u043E \u0434\u043E\u0432\u0433\u043E. \u041C\u043E\u0436\u043B\u0438\u0432\u043E, \u0441\u0435\u0440\u0432\u0435\u0440 \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u0438\u0439.", errUnknown: "\u0423 Wikiweigher \u0441\u0442\u0430\u043B\u0430\u0441\u044F \u043D\u0435\u043E\u0447\u0456\u043A\u0443\u0432\u0430\u043D\u0430 \u043F\u043E\u043C\u0438\u043B\u043A\u0430.", retry: "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0438", reportBug: "\u041F\u043E\u0432\u0456\u0434\u043E\u043C\u0438\u0442\u0438", errOffline: "\u0421\u0445\u043E\u0436\u0435, \u0432\u0438 \u043D\u0435 \u0432 \u043C\u0435\u0440\u0435\u0436\u0456. \u0412\u0456\u0434\u043D\u043E\u0432\u0456\u0442\u044C \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F \u0442\u0430 \u0441\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0449\u0435 \u0440\u0430\u0437." },
    pl: { enjoying: "Podoba ci si\u0119 Wikiweigher?", rateIt: "Oce\u0144", later: "P\xF3\u017Aniej", noThanks: "Nie, dzi\u0119kuj\u0119", bestOverall: "Najlepszy og\xF3lnie", amongBestSub: "\u017Baden inny j\u0119zyk nie jest wyra\u017Anie pe\u0142niejszy.", open: "Otw\xF3rz", translate: "Czytaj w t\u0142umaczeniu", ranking: "Sortowanie j\u0119zyk\xF3w\u2026", finding: "Szukanie innych j\u0119zyk\xF3w\u2026", language: "j\u0119zyk", wordsRefs: "s\u0142\xF3w \xB7 przyp.", metric: "skorygowanych s\u0142\xF3w tekstu + przypisy", sharpening: "szacunkowo - u\u015Bci\u015Blanie\u2026", here: "tu", best: "Najlepszy", words: "s\u0142\xF3w", refsWord: "przyp.", bestSourcedLabel: "Najlepiej \u017Ar\xF3d\u0142owany", featured: "Artyku\u0142 na medal", good: "Dobry artyku\u0142", minimize: "Zminimalizuj", close: "Zamknij", settings: "Ustawienia", openApp: "Otw\xF3rz Wikiweigher", current: "bie\u017C\u0105cy", langsOf: "w {total} j\u0119zykach", errorTitle: "Co\u015B posz\u0142o nie tak", errNetwork: "Nie uda\u0142o si\u0119 po\u0142\u0105czy\u0107 z Wikipedi\u0105. Sprawd\u017A po\u0142\u0105czenie i spr\xF3buj ponownie.", errTimeout: "Wikipedia odpowiada\u0142a zbyt d\u0142ugo. Serwer mo\u017Ce by\u0107 obci\u0105\u017Cony.", errUnknown: "Wikiweigher napotka\u0142 nieoczekiwany problem.", retry: "Spr\xF3buj ponownie", reportBug: "Zg\u0142o\u015B", errOffline: "Wygl\u0105da na to, \u017Ce jeste\u015B offline. Po\u0142\u0105cz si\u0119 ponownie i spr\xF3buj jeszcze raz." },
    tr: { enjoying: "Wikiweigher ho\u015Funuza gitti mi?", rateIt: "Puan ver", later: "Sonra", noThanks: "Hay\u0131r, te\u015Fekk\xFCrler", bestOverall: "Genel olarak en iyi", amongBestSub: "Belirgin \u015Fekilde daha kapsaml\u0131 ba\u015Fka dil yok.", open: "A\xE7", translate: "\xC7evrilmi\u015F oku", ranking: "Diller s\u0131ralan\u0131yor\u2026", finding: "Di\u011Fer diller aran\u0131yor\u2026", language: "dil", wordsRefs: "kelime \xB7 kaynak", metric: "ayarlanm\u0131\u015F metin kelimeleri + kaynaklar", sharpening: "tahmini - iyile\u015Ftiriliyor\u2026", here: "burada", best: "En iyi", words: "kelime", refsWord: "kaynak", bestSourcedLabel: "En iyi kaynakl\u0131", featured: "Se\xE7kin madde", good: "Kaliteli madde", minimize: "K\xFC\xE7\xFClt", close: "Kapat", settings: "Ayarlar", openApp: "Wikiweigher\u2019y\u0131 a\xE7", current: "ge\xE7erli", langsOf: "{total} dilde", errorTitle: "Bir \u015Feyler ters gitti", errNetwork: "Wikipediaya ula\u015F\u0131lamad\u0131. Ba\u011Flant\u0131n\u0131 kontrol edip yeniden dene.", errTimeout: "Wikipedia yan\u0131t vermekte \xE7ok gecikti. Sunucu yo\u011Fun olabilir.", errUnknown: "Wikiweigher beklenmedik bir sorunla kar\u015F\u0131la\u015Ft\u0131.", retry: "Yeniden dene", reportBug: "Bildir", errOffline: "\xC7evrimd\u0131\u015F\u0131 g\xF6r\xFCn\xFCyorsun. Yeniden ba\u011Flan\u0131p tekrar dene." },
    id: { enjoying: "Suka dengan Wikiweigher?", rateIt: "Beri nilai", later: "Nanti", noThanks: "Tidak, terima kasih", bestOverall: "Terbaik secara keseluruhan", amongBestSub: "Tidak ada bahasa lain yang jelas lebih lengkap.", open: "Buka", translate: "Baca terjemahan", ranking: "Mengurutkan bahasa\u2026", finding: "Mencari bahasa lain\u2026", language: "bahasa", wordsRefs: "kata \xB7 ref.", metric: "kata teks tersesuaikan + referensi", sharpening: "perkiraan - menyempurnakan\u2026", here: "di sini", best: "Terbaik", words: "kata", refsWord: "ref.", bestSourcedLabel: "Sumber terbanyak", featured: "Artikel pilihan", good: "Artikel bagus", minimize: "Minimalkan", close: "Tutup", settings: "Pengaturan", openApp: "Buka Wikiweigher", current: "saat ini", langsOf: "dalam {total} bahasa", errorTitle: "Ada yang tidak beres", errNetwork: "Tidak dapat menghubungi Wikipedia. Periksa koneksi lalu coba lagi.", errTimeout: "Wikipedia terlalu lama merespons. Mungkin sedang sibuk.", errUnknown: "Wikiweigher mengalami masalah tak terduga.", retry: "Coba lagi", reportBug: "Laporkan", errOffline: "Sepertinya kamu sedang offline. Sambungkan lagi lalu coba ulang." },
    vi: { enjoying: "B\u1EA1n th\u1EA5y Wikiweigher th\u1EBF n\xE0o?", rateIt: "\u0110\xE1nh gi\xE1", later: "\u0110\u1EC3 sau", noThanks: "Kh\xF4ng, c\u1EA3m \u01A1n", bestOverall: "T\u1ED1t nh\u1EA5t nh\xECn chung", amongBestSub: "Kh\xF4ng ng\xF4n ng\u1EEF n\xE0o kh\xE1c r\xF5 r\xE0ng \u0111\u1EA7y \u0111\u1EE7 h\u01A1n.", open: "M\u1EDF", translate: "\u0110\u1ECDc b\u1EA3n d\u1ECBch", ranking: "\u0110ang x\u1EBFp h\u1EA1ng ng\xF4n ng\u1EEF\u2026", finding: "\u0110ang t\xECm ng\xF4n ng\u1EEF kh\xE1c\u2026", language: "ng\xF4n ng\u1EEF", wordsRefs: "t\u1EEB \xB7 ngu\u1ED3n", metric: "s\u1ED1 t\u1EEB v\u0103n b\u1EA3n \u0111\xE3 \u0111i\u1EC1u ch\u1EC9nh + ngu\u1ED3n", sharpening: "\u01B0\u1EDBc t\xEDnh - \u0111ang tinh ch\u1EC9nh\u2026", here: "\u1EDF \u0111\xE2y", best: "T\u1ED1t nh\u1EA5t", words: "t\u1EEB", refsWord: "ngu\u1ED3n", bestSourcedLabel: "Nhi\u1EC1u ngu\u1ED3n nh\u1EA5t", featured: "B\xE0i vi\u1EBFt ch\u1ECDn l\u1ECDc", good: "B\xE0i vi\u1EBFt t\u1ED1t", minimize: "Thu nh\u1ECF", close: "\u0110\xF3ng", settings: "C\xE0i \u0111\u1EB7t", openApp: "M\u1EDF Wikiweigher", current: "hi\u1EC7n t\u1EA1i", langsOf: "trong {total} ng\xF4n ng\u1EEF", errorTitle: "\u0110\xE3 x\u1EA3y ra l\u1ED7i", errNetwork: "Kh\xF4ng k\u1EBFt n\u1ED1i \u0111\u01B0\u1EE3c v\u1EDBi Wikipedia. H\xE3y ki\u1EC3m tra k\u1EBFt n\u1ED1i v\xE0 th\u1EED l\u1EA1i.", errTimeout: "Wikipedia ph\u1EA3n h\u1ED3i qu\xE1 l\xE2u. M\xE1y ch\u1EE7 c\xF3 th\u1EC3 \u0111ang b\u1EADn.", errUnknown: "Wikiweigher g\u1EB7p s\u1EF1 c\u1ED1 ngo\xE0i d\u1EF1 ki\u1EBFn.", retry: "Th\u1EED l\u1EA1i", reportBug: "B\xE1o l\u1ED7i", errOffline: "C\xF3 v\u1EBB b\u1EA1n \u0111ang ngo\u1EA1i tuy\u1EBFn. H\xE3y k\u1EBFt n\u1ED1i l\u1EA1i v\xE0 th\u1EED l\u1EA1i." },
    ja: { enjoying: "Wikiweigher \u306F\u3044\u304B\u304C\u3067\u3059\u304B\uFF1F", rateIt: "\u8A55\u4FA1\u3059\u308B", later: "\u3042\u3068\u3067", noThanks: "\u7D50\u69CB\u3067\u3059", bestOverall: "\u7DCF\u5408\u7684\u306B\u6700\u826F", amongBestSub: "\u660E\u3089\u304B\u306B\u3088\u308A\u5145\u5B9F\u3057\u305F\u8A00\u8A9E\u306F\u3042\u308A\u307E\u305B\u3093\u3002", open: "\u958B\u304F", translate: "\u7FFB\u8A33\u3057\u3066\u8AAD\u3080", ranking: "\u8A00\u8A9E\u3092\u9806\u4F4D\u4ED8\u3051\u4E2D\u2026", finding: "\u4ED6\u306E\u8A00\u8A9E\u3092\u691C\u7D22\u4E2D\u2026", language: "\u8A00\u8A9E", wordsRefs: "\u8A9E\u6570 \xB7 \u51FA\u5178", metric: "\u88DC\u6B63\u5F8C\u306E\u672C\u6587\u8A9E\u6570\uFF0B\u51FA\u5178", sharpening: "\u63A8\u5B9A - \u7CBE\u7DFB\u5316\u4E2D\u2026", here: "\u3053\u3053", best: "\u6700\u826F", words: "\u8A9E", refsWord: "\u51FA\u5178", bestSourcedLabel: "\u51FA\u5178\u304C\u6700\u591A", featured: "\u79C0\u9038\u306A\u8A18\u4E8B", good: "\u826F\u8CEA\u306A\u8A18\u4E8B", minimize: "\u6700\u5C0F\u5316", close: "\u9589\u3058\u308B", settings: "\u8A2D\u5B9A", openApp: "Wikiweigher \u3092\u958B\u304F", current: "\u73FE\u5728", langsOf: "{total}\u8A00\u8A9E\u3067", errorTitle: "\u554F\u984C\u304C\u767A\u751F\u3057\u307E\u3057\u305F", errNetwork: "\u30A6\u30A3\u30AD\u30DA\u30C7\u30A3\u30A2\u306B\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093\u3002\u63A5\u7D9A\u3092\u78BA\u8A8D\u3057\u3066\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002", errTimeout: "\u30A6\u30A3\u30AD\u30DA\u30C7\u30A3\u30A2\u306E\u5FDC\u7B54\u306B\u6642\u9593\u304C\u304B\u304B\u308A\u3059\u304E\u307E\u3057\u305F\u3002\u6DF7\u96D1\u3057\u3066\u3044\u308B\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059\u3002", errUnknown: "Wikiweigher \u3067\u4E88\u671F\u3057\u306A\u3044\u554F\u984C\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u3002", retry: "\u518D\u8A66\u884C", reportBug: "\u5831\u544A", errOffline: "\u30AA\u30D5\u30E9\u30A4\u30F3\u306E\u3088\u3046\u3067\u3059\u3002\u63A5\u7D9A\u3092\u78BA\u8A8D\u3057\u3066\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002" },
    zh: { enjoying: "\u89C9\u5F97 Wikiweigher \u597D\u7528\u5417\uFF1F", rateIt: "\u8BC4\u5206", later: "\u7A0D\u540E", noThanks: "\u4E0D\u7528\u4E86", bestOverall: "\u7EFC\u5408\u6700\u4F73", amongBestSub: "\u6CA1\u6709\u5176\u4ED6\u8BED\u8A00\u660E\u663E\u66F4\u5B8C\u6574\u3002", open: "\u6253\u5F00", translate: "\u7FFB\u8BD1\u9605\u8BFB", ranking: "\u6B63\u5728\u6392\u5E8F\u8BED\u8A00\u2026", finding: "\u6B63\u5728\u67E5\u627E\u5176\u4ED6\u8BED\u8A00\u2026", language: "\u8BED\u8A00", wordsRefs: "\u5B57\u6570 \xB7 \u53C2\u8003", metric: "\u6821\u6B63\u540E\u6B63\u6587\u5B57\u6570 + \u53C2\u8003", sharpening: "\u4F30\u7B97 - \u4F18\u5316\u4E2D\u2026", here: "\u5F53\u524D", best: "\u6700\u4F73", words: "\u5B57", refsWord: "\u53C2\u8003", bestSourcedLabel: "\u6765\u6E90\u6700\u5168", featured: "\u5178\u8303\u6761\u76EE", good: "\u4F18\u826F\u6761\u76EE", minimize: "\u6700\u5C0F\u5316", close: "\u5173\u95ED", settings: "\u8BBE\u7F6E", openApp: "\u6253\u5F00 Wikiweigher", current: "\u5F53\u524D", langsOf: "\u5171 {total} \u79CD\u8BED\u8A00", errorTitle: "\u51FA\u4E86\u70B9\u95EE\u9898", errNetwork: "\u65E0\u6CD5\u8FDE\u63A5\u7EF4\u57FA\u767E\u79D1\u3002\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002", errTimeout: "\u7EF4\u57FA\u767E\u79D1\u54CD\u5E94\u8D85\u65F6\uFF0C\u670D\u52A1\u5668\u53EF\u80FD\u7E41\u5FD9\u3002", errUnknown: "Wikiweigher \u9047\u5230\u610F\u5916\u95EE\u9898\u3002", retry: "\u91CD\u8BD5", reportBug: "\u53CD\u9988", errOffline: "\u4F60\u4F3C\u4E4E\u5904\u4E8E\u79BB\u7EBF\u72B6\u6001\u3002\u8BF7\u91CD\u65B0\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002" },
    ko: { enjoying: "Wikiweigher \uAC00 \uB9C8\uC74C\uC5D0 \uB4DC\uC2DC\uB098\uC694?", rateIt: "\uD3C9\uAC00\uD558\uAE30", later: "\uB098\uC911\uC5D0", noThanks: "\uAD1C\uCC2E\uC2B5\uB2C8\uB2E4", bestOverall: "\uC885\uD569 \uCD5C\uACE0", amongBestSub: "\uD655\uC2E4\uD788 \uB354 \uC644\uC804\uD55C \uC5B8\uC5B4\uB294 \uC5C6\uC2B5\uB2C8\uB2E4.", open: "\uC5F4\uAE30", translate: "\uBC88\uC5ED\uD558\uC5EC \uC77D\uAE30", ranking: "\uC5B8\uC5B4 \uC21C\uC704 \uB9E4\uAE30\uB294 \uC911\u2026", finding: "\uB2E4\uB978 \uC5B8\uC5B4 \uCC3E\uB294 \uC911\u2026", language: "\uC5B8\uC5B4", wordsRefs: "\uB2E8\uC5B4 \xB7 \uCD9C\uCC98", metric: "\uBCF4\uC815\uB41C \uBCF8\uBB38 \uB2E8\uC5B4 + \uCD9C\uCC98", sharpening: "\uCD94\uC815 - \uC815\uBC00\uD654 \uC911\u2026", here: "\uD604\uC7AC", best: "\uCD5C\uACE0", words: "\uB2E8\uC5B4", refsWord: "\uCD9C\uCC98", bestSourcedLabel: "\uCD9C\uCC98 \uCD5C\uB2E4", featured: "\uC54C\uCC2C \uAE00", good: "\uC88B\uC740 \uAE00", minimize: "\uCD5C\uC18C\uD654", close: "\uB2EB\uAE30", settings: "\uC124\uC815", openApp: "Wikiweigher \uC5F4\uAE30", current: "\uD604\uC7AC", langsOf: "\uCD1D {total}\uAC1C \uC5B8\uC5B4", errorTitle: "\uBB38\uC81C\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4", errNetwork: "\uC704\uD0A4\uBC31\uACFC\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC5F0\uACB0\uC744 \uD655\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.", errTimeout: "\uC704\uD0A4\uBC31\uACFC \uC751\uB2F5\uC774 \uB108\uBB34 \uC624\uB798 \uAC78\uB838\uC2B5\uB2C8\uB2E4. \uC11C\uBC84\uAC00 \uD63C\uC7A1\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.", errUnknown: "Wikiweigher\uC5D0 \uC608\uAE30\uCE58 \uC54A\uC740 \uBB38\uC81C\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.", retry: "\uB2E4\uC2DC \uC2DC\uB3C4", reportBug: "\uC2E0\uACE0", errOffline: "\uC624\uD504\uB77C\uC778 \uC0C1\uD0DC\uB85C \uBCF4\uC785\uB2C8\uB2E4. \uB2E4\uC2DC \uC5F0\uACB0\uD55C \uB4A4 \uC2DC\uB3C4\uD558\uC138\uC694." },
    ar: { enjoying: "\u0647\u0644 \u0623\u0639\u062C\u0628\u0643 Wikiweigher\u061F", rateIt: "\u0642\u064A\u0651\u0645\u0647", later: "\u0644\u0627\u062D\u0642\u064B\u0627", noThanks: "\u0644\u0627\u060C \u0634\u0643\u0631\u064B\u0627", bestOverall: "\u0627\u0644\u0623\u0641\u0636\u0644 \u0625\u062C\u0645\u0627\u0644\u0627\u064B", amongBestSub: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0644\u063A\u0629 \u0623\u062E\u0631\u0649 \u0623\u0643\u062B\u0631 \u0627\u0643\u062A\u0645\u0627\u0644\u0627\u064B \u0628\u0648\u0636\u0648\u062D.", open: "\u0641\u062A\u062D", translate: "\u0627\u0642\u0631\u0623 \u0645\u062A\u0631\u062C\u0645\u0627\u064B", ranking: "\u062C\u0627\u0631\u064D \u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0644\u063A\u0627\u062A\u2026", finding: "\u062C\u0627\u0631\u064D \u0627\u0644\u0628\u062D\u062B \u0639\u0646 \u0644\u063A\u0627\u062A \u0623\u062E\u0631\u0649\u2026", language: "\u0627\u0644\u0644\u063A\u0629", wordsRefs: "\u0643\u0644\u0645\u0627\u062A \xB7 \u0645\u0631\u0627\u062C\u0639", metric: "\u0643\u0644\u0645\u0627\u062A \u0627\u0644\u0646\u0635 \u0627\u0644\u0645\u0639\u062F\u064E\u0651\u0644\u0629 + \u0627\u0644\u0645\u0631\u0627\u062C\u0639", sharpening: "\u062A\u0642\u062F\u064A\u0631\u064A - \u064A\u062C\u0631\u064A \u0627\u0644\u062A\u062D\u0633\u064A\u0646\u2026", here: "\u0647\u0646\u0627", best: "\u0627\u0644\u0623\u0641\u0636\u0644", words: "\u0643\u0644\u0645\u0629", refsWord: "\u0645\u0631\u0627\u062C\u0639", bestSourcedLabel: "\u0627\u0644\u0623\u0643\u062B\u0631 \u0645\u0635\u0627\u062F\u0631", featured: "\u0645\u0642\u0627\u0644\u0629 \u0645\u062E\u062A\u0627\u0631\u0629", good: "\u0645\u0642\u0627\u0644\u0629 \u062C\u064A\u062F\u0629", minimize: "\u062A\u0635\u063A\u064A\u0631", close: "\u0625\u063A\u0644\u0627\u0642", settings: "\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A", openApp: "\u0641\u062A\u062D Wikiweigher", current: "\u0627\u0644\u062D\u0627\u0644\u064A\u0629", langsOf: "\u0628\u0640 {total} \u0644\u063A\u0629", errorTitle: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0645\u0627", errNetwork: "\u062A\u0639\u0630\u0631 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0648\u064A\u0643\u064A\u0628\u064A\u062F\u064A\u0627. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0648\u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u0627.", errTimeout: "\u0627\u0633\u062A\u063A\u0631\u0642\u062A \u0648\u064A\u0643\u064A\u0628\u064A\u062F\u064A\u0627 \u0648\u0642\u062A\u0627 \u0637\u0648\u064A\u0644\u0627 \u0644\u0644\u0631\u062F. \u0642\u062F \u064A\u0643\u0648\u0646 \u0627\u0644\u062E\u0627\u062F\u0645 \u0645\u0634\u063A\u0648\u0644\u0627.", errUnknown: "\u0648\u0627\u062C\u0647 Wikiweigher \u0645\u0634\u0643\u0644\u0629 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639\u0629.", retry: "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629", reportBug: "\u0625\u0628\u0644\u0627\u063A", errOffline: "\u064A\u0628\u062F\u0648 \u0623\u0646\u0643 \u063A\u064A\u0631 \u0645\u062A\u0635\u0644. \u0623\u0639\u062F \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u062B\u0645 \u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u0627." },
    fa: { enjoying: "\u0627\u0632 Wikiweigher \u0631\u0627\u0636\u06CC \u0647\u0633\u062A\u06CC\u062F\u061F", rateIt: "\u0627\u0645\u062A\u06CC\u0627\u0632 \u062F\u0647\u06CC\u062F", later: "\u0628\u0639\u062F\u0627\u064B", noThanks: "\u0646\u0647\u060C \u0645\u0645\u0646\u0648\u0646", bestOverall: "\u0628\u0647\u062A\u0631\u06CC\u0646 \u062F\u0631 \u0645\u062C\u0645\u0648\u0639", amongBestSub: "\u0647\u06CC\u0686 \u0632\u0628\u0627\u0646 \u062F\u06CC\u06AF\u0631\u06CC \u0628\u0647\u200C\u0648\u0636\u0648\u062D \u06A9\u0627\u0645\u0644\u200C\u062A\u0631 \u0646\u06CC\u0633\u062A.", open: "\u0628\u0627\u0632 \u06A9\u0631\u062F\u0646", translate: "\u062E\u0648\u0627\u0646\u062F\u0646 \u062A\u0631\u062C\u0645\u0647\u200C\u0634\u062F\u0647", ranking: "\u062F\u0631 \u062D\u0627\u0644 \u0631\u062A\u0628\u0647\u200C\u0628\u0646\u062F\u06CC \u0632\u0628\u0627\u0646\u200C\u0647\u0627\u2026", finding: "\u062F\u0631 \u062D\u0627\u0644 \u06CC\u0627\u0641\u062A\u0646 \u0632\u0628\u0627\u0646\u200C\u0647\u0627\u06CC \u062F\u06CC\u06AF\u0631\u2026", language: "\u0632\u0628\u0627\u0646", wordsRefs: "\u0648\u0627\u0698\u0647 \xB7 \u0645\u0646\u0628\u0639", metric: "\u0648\u0627\u0698\u0647\u200C\u0647\u0627\u06CC \u0645\u062A\u0646 \u062A\u0646\u0638\u06CC\u0645\u200C\u0634\u062F\u0647 + \u0645\u0646\u0627\u0628\u0639", sharpening: "\u062A\u062E\u0645\u06CC\u0646\u06CC - \u062F\u0631 \u062D\u0627\u0644 \u062F\u0642\u06CC\u0642\u200C\u0633\u0627\u0632\u06CC\u2026", here: "\u0627\u06CC\u0646\u062C\u0627", best: "\u0628\u0647\u062A\u0631\u06CC\u0646", words: "\u0648\u0627\u0698\u0647", refsWord: "\u0645\u0646\u0628\u0639", bestSourcedLabel: "\u0628\u06CC\u0634\u062A\u0631\u06CC\u0646 \u0645\u0646\u0627\u0628\u0639", featured: "\u0645\u0642\u0627\u0644\u0647\u0654 \u0628\u0631\u06AF\u0632\u06CC\u062F\u0647", good: "\u0645\u0642\u0627\u0644\u0647\u0654 \u062E\u0648\u0628", minimize: "\u06A9\u0648\u0686\u06A9 \u06A9\u0631\u062F\u0646", close: "\u0628\u0633\u062A\u0646", settings: "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A", openApp: "\u0628\u0627\u0632 \u06A9\u0631\u062F\u0646 Wikiweigher", current: "\u06A9\u0646\u0648\u0646\u06CC", langsOf: "\u062F\u0631 {total} \u0632\u0628\u0627\u0646", errorTitle: "\u0645\u0634\u06A9\u0644\u06CC \u067E\u06CC\u0634 \u0622\u0645\u062F", errNetwork: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u0648\u06CC\u06A9\u06CC\u200C\u067E\u062F\u06CC\u0627 \u0645\u0645\u06A9\u0646 \u0646\u0634\u062F. \u0627\u062A\u0635\u0627\u0644 \u0631\u0627 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F \u0648 \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.", errTimeout: "\u0648\u06CC\u06A9\u06CC\u200C\u067E\u062F\u06CC\u0627 \u062E\u06CC\u0644\u06CC \u062F\u06CC\u0631 \u067E\u0627\u0633\u062E \u062F\u0627\u062F. \u0645\u0645\u06A9\u0646 \u0627\u0633\u062A \u0633\u0631\u0648\u0631 \u0634\u0644\u0648\u063A \u0628\u0627\u0634\u062F.", errUnknown: "Wikiweigher \u0628\u0627 \u0645\u0634\u06A9\u0644\u06CC \u063A\u06CC\u0631\u0645\u0646\u062A\u0638\u0631\u0647 \u0631\u0648\u0628\u0647\u200C\u0631\u0648 \u0634\u062F.", retry: "\u062A\u0644\u0627\u0634 \u062F\u0648\u0628\u0627\u0631\u0647", reportBug: "\u06AF\u0632\u0627\u0631\u0634", errOffline: "\u0628\u0647 \u0646\u0638\u0631 \u0645\u06CC\u200C\u0631\u0633\u062F \u0622\u0641\u0644\u0627\u06CC\u0646 \u0647\u0633\u062A\u06CC\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u0645\u062A\u0635\u0644 \u0634\u0648\u06CC\u062F \u0648 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F." },
    hi: { enjoying: "Wikiweigher \u092A\u0938\u0902\u0926 \u0906\u092F\u093E?", rateIt: "\u0930\u0947\u091F \u0915\u0930\u0947\u0902", later: "\u092C\u093E\u0926 \u092E\u0947\u0902", noThanks: "\u0928\u0939\u0940\u0902, \u0927\u0928\u094D\u092F\u0935\u093E\u0926", bestOverall: "\u0915\u0941\u0932 \u092E\u093F\u0932\u093E\u0915\u0930 \u0938\u0930\u094D\u0935\u0936\u094D\u0930\u0947\u0937\u094D\u0920", amongBestSub: "\u0915\u094B\u0908 \u0905\u0928\u094D\u092F \u092D\u093E\u0937\u093E \u0938\u094D\u092A\u0937\u094D\u091F \u0930\u0942\u092A \u0938\u0947 \u0905\u0927\u093F\u0915 \u092A\u0942\u0930\u094D\u0923 \u0928\u0939\u0940\u0902 \u0939\u0948\u0964", open: "\u0916\u094B\u0932\u0947\u0902", translate: "\u0905\u0928\u0941\u0935\u093E\u0926\u093F\u0924 \u092A\u0922\u093C\u0947\u0902", ranking: "\u092D\u093E\u0937\u093E\u0913\u0902 \u0915\u094B \u0915\u094D\u0930\u092E\u092C\u0926\u094D\u0927 \u0915\u093F\u092F\u093E \u091C\u093E \u0930\u0939\u093E \u0939\u0948\u2026", finding: "\u0905\u0928\u094D\u092F \u092D\u093E\u0937\u093E\u090F\u0901 \u0916\u094B\u091C\u0940 \u091C\u093E \u0930\u0939\u0940 \u0939\u0948\u0902\u2026", language: "\u092D\u093E\u0937\u093E", wordsRefs: "\u0936\u092C\u094D\u0926 \xB7 \u0938\u0902\u0926\u0930\u094D\u092D", metric: "\u0938\u092E\u093E\u092F\u094B\u091C\u093F\u0924 \u092E\u0942\u0932 \u092A\u093E\u0920 \u0936\u092C\u094D\u0926 + \u0938\u0902\u0926\u0930\u094D\u092D", sharpening: "\u0905\u0928\u0941\u092E\u093E\u0928\u093F\u0924 - \u092A\u0930\u093F\u0937\u094D\u0915\u0943\u0924 \u0915\u093F\u092F\u093E \u091C\u093E \u0930\u0939\u093E \u0939\u0948\u2026", here: "\u092F\u0939\u093E\u0901", best: "\u0938\u0930\u094D\u0935\u0936\u094D\u0930\u0947\u0937\u094D\u0920", words: "\u0936\u092C\u094D\u0926", refsWord: "\u0938\u0902\u0926\u0930\u094D\u092D", bestSourcedLabel: "\u0938\u0930\u094D\u0935\u093E\u0927\u093F\u0915 \u0938\u094D\u0930\u094B\u0924", featured: "\u0928\u093F\u0930\u094D\u0935\u093E\u091A\u093F\u0924 \u0932\u0947\u0916", good: "\u0905\u091A\u094D\u091B\u093E \u0932\u0947\u0916", minimize: "\u091B\u094B\u091F\u093E \u0915\u0930\u0947\u0902", close: "\u092C\u0902\u0926 \u0915\u0930\u0947\u0902", settings: "\u0938\u0947\u091F\u093F\u0902\u0917\u094D\u0938", openApp: "Wikiweigher \u0916\u094B\u0932\u0947\u0902", current: "\u0935\u0930\u094D\u0924\u092E\u093E\u0928", langsOf: "{total} \u092D\u093E\u0937\u093E\u0913\u0902 \u092E\u0947\u0902", errorTitle: "\u0915\u0941\u091B \u0917\u0921\u093C\u092C\u0921\u093C \u0939\u094B \u0917\u0908", errNetwork: "\u0935\u093F\u0915\u093F\u092A\u0940\u0921\u093F\u092F\u093E \u0938\u0947 \u0938\u0902\u092A\u0930\u094D\u0915 \u0928\u0939\u0940\u0902 \u0939\u094B \u0938\u0915\u093E\u0964 \u0915\u0928\u0947\u0915\u094D\u0936\u0928 \u091C\u093E\u0902\u091A\u0947\u0902 \u0914\u0930 \u092B\u093F\u0930 \u0915\u094B\u0936\u093F\u0936 \u0915\u0930\u0947\u0902\u0964", errTimeout: "\u0935\u093F\u0915\u093F\u092A\u0940\u0921\u093F\u092F\u093E \u0928\u0947 \u091C\u0935\u093E\u092C \u0926\u0947\u0928\u0947 \u092E\u0947\u0902 \u092C\u0939\u0941\u0924 \u0926\u0947\u0930 \u0932\u0917\u093E\u0908\u0964 \u0938\u0930\u094D\u0935\u0930 \u0935\u094D\u092F\u0938\u094D\u0924 \u0939\u094B \u0938\u0915\u0924\u093E \u0939\u0948\u0964", errUnknown: "Wikiweigher \u092E\u0947\u0902 \u090F\u0915 \u0905\u0928\u092A\u0947\u0915\u094D\u0937\u093F\u0924 \u0938\u092E\u0938\u094D\u092F\u093E \u0906\u0908\u0964", retry: "\u092B\u093F\u0930 \u0915\u094B\u0936\u093F\u0936 \u0915\u0930\u0947\u0902", reportBug: "\u0930\u093F\u092A\u094B\u0930\u094D\u091F \u0915\u0930\u0947\u0902", errOffline: "\u0932\u0917\u0924\u093E \u0939\u0948 \u0906\u092A \u0911\u092B\u093C\u0932\u093E\u0907\u0928 \u0939\u0948\u0902\u0964 \u0926\u094B\u092C\u093E\u0930\u093E \u0915\u0928\u0947\u0915\u094D\u091F \u0915\u0930\u0915\u0947 \u0915\u094B\u0936\u093F\u0936 \u0915\u0930\u0947\u0902\u0964" }
  };
  var LANGS = Object.keys(STR);
  function t(lang, key2, params) {
    const dict = STR[lang] || STR.en;
    let s = dict[key2] != null ? dict[key2] : STR.en[key2];
    if (params) for (const [k, v2] of Object.entries(params)) s = s.replace("{" + k + "}", v2);
    return s;
  }

  var RTL = /* @__PURE__ */ new Set(["ar", "fa", "he", "ur", "ps", "sd", "ckb", "yi", "dv", "arz", "azb", "ckb"]);
  function fmtK(n) {
    if (n == null) return "";
    return n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k" : String(n);
  }
  function el(doc, tag, props = {}, kids = []) {
    const node = doc.createElement(tag);
    for (const [k, v2] of Object.entries(props)) {
      if (k === "class") node.className = v2;
      else if (k === "html") node.innerHTML = v2;
      else if (k === "text") node.textContent = v2;
      else node.setAttribute(k, v2);
    }
    for (const kid of kids) if (kid) node.appendChild(kid);
    return node;
  }
  function iconBtn(doc, act, label, icon) {
    return el(doc, "button", { class: "cx-icon-btn", "data-act": act, "aria-label": label, html: icon });
  }
  function badgeEl(doc, lang, badge) {
    return el(doc, "span", { class: "cx-badge cx-badge-" + badge, text: "\u2605", title: t(lang, badge) });
  }
  function reads(model, lang) {
    return (model.settings?.languagesIRead || []).includes(lang);
  }
  function head(doc, lang) {
    return el(doc, "div", { class: "cx-head", "data-drag-handle": "1" }, [
      el(doc, "span", { class: "cx-head-title", html: ICONS.world + "<span>Wikiweigher</span>" }),
      el(doc, "span", { class: "cx-spacer" }),
      iconBtn(doc, "min", t(lang, "minimize"), ICONS.minus),
      iconBtn(doc, "close", t(lang, "close"), ICONS.x)
    ]);
  }
  function reasonText(L, best) {
    if (best.words == null) return best.refs != null ? `${best.refs} ${t(L, "refsWord")}` : "";
    return `${fmtK(best.words)} ${t(L, "words")} \xB7 ${best.refs} ${t(L, "refsWord")}`;
  }
  function sourcedLine(doc, L, model, shownLang) {
    const bs = model.bestSourced;
    if (!bs || !model.best || bs.lang === shownLang || !(bs.refs > model.best.refs)) return null;
    const isCur = bs.lang === model.current;
    const link = el(doc, "button", { class: "cx-sourced-link", "data-act": "open", "data-lang": bs.lang }, [
      el(doc, "span", { text: nativeName(bs.lang) + " \xB7 " + bs.refs + " " }),
      el(doc, "span", { html: ICONS.external })
    ]);
    const kids = [
      el(doc, "span", { class: "cx-sourced-icon", html: ICONS.bookmark }),
      el(doc, "span", { class: "cx-sourced-label", text: t(L, "bestSourcedLabel") }),
      link
    ];
    if (isCur) kids.push(el(doc, "span", { class: "cx-you", text: t(L, "here") }));
    return el(doc, "div", { class: "cx-sourced" }, kids);
  }
  function hero(doc, model) {
    const L = model.uiLang || model.current;
    const staying = model.verdict?.type === "stay";
    const onCurrent = staying && (model.ranked || []).find((r) => r.lang === model.current);
    const best = onCurrent || model.best;
    const isCurrentBest = best.lang === model.current;
    const nameRow = [
      el(doc, "span", { class: "cx-best-name", text: nativeName(best.lang) }),
      best.badge ? badgeEl(doc, L, best.badge) : null
    ];
    if (isCurrentBest) {
      nameRow.push(el(doc, "span", { class: "cx-you", text: t(L, "here") }));
      nameRow.push(el(doc, "span", { class: "cx-spacer" }));
    } else {
      nameRow.push(el(doc, "span", { class: "cx-best-en", text: englishName(best.lang) }));
      nameRow.push(el(doc, "span", { class: "cx-spacer" }));
      nameRow.push(el(doc, "button", { class: "cx-open", "data-act": "open", "data-lang": best.lang, html: t(L, "open") + " " + ICONS.external }));
    }
    const kids = [
      el(doc, "div", { class: "cx-best-label", text: t(L, "bestOverall") }),
      el(doc, "div", { class: "cx-best-main" }, nameRow)
    ];
    if (isCurrentBest) {
      kids.push(el(doc, "div", { class: "cx-best-reason", text: t(L, "amongBestSub") }));
    } else {
      kids.push(el(doc, "div", { class: "cx-best-reason", text: reasonText(L, best) }));
      if (!reads(model, best.lang)) {
        kids.push(el(doc, "button", { class: "cx-translate", "data-act": "translate", "data-lang": best.lang, html: ICONS.translate + " " + t(L, "translate") }));
      }
    }
    const sourced = sourcedLine(doc, L, model, best.lang);
    if (sourced) kids.push(sourced);
    return el(doc, "div", { class: "cx-best" }, kids);
  }
  function row(doc, model, l) {
    const L = model.uiLang || model.current;
    const isCur = l.lang === model.current;
    let cls = "cx-row";
    if (isCur) cls += " cx-current";
    if (model.best && l.lang === model.best.lang) cls += " cx-top";
    const stat = l.estimated ? "~ \xB7 ~" : `${fmtK(l.words)} \xB7 ${l.refs ?? "-"}`;
    const fill = el(doc, "span", { class: "cx-bar-fill", style: `width:${Math.round((l.score || 0) * 100)}%` });
    const nameKids = [el(doc, "span", { class: "cx-name-text", text: nativeName(l.lang) })];
    if (l.badge) nameKids.push(badgeEl(doc, L, l.badge));
    if (isCur) nameKids.push(el(doc, "span", { class: "cx-you", text: t(L, "here") }));
    const aria = `${englishName(l.lang)}${isCur ? " (" + t(L, "current") + ")" : ""}${l.estimated ? "" : ", " + l.words + " " + t(L, "words")}${l.badge ? ", " + t(L, l.badge) : ""}`;
    return el(doc, "button", { class: cls, "data-act": "lang", "data-lang": l.lang, title: englishName(l.lang), "aria-label": aria }, [
      el(doc, "span", { class: "cx-row-name" }, nameKids),
      el(doc, "span", { class: "cx-bar" }, [fill]),
      el(doc, "span", { class: "cx-row-stat", text: stat })
    ]);
  }
  var ERROR_KEY = { network: "errNetwork", timeout: "errTimeout", offline: "errOffline", unknown: "errUnknown" };
  function errorBlock(doc, model) {
    const L = model.uiLang || model.current;
    const key2 = ERROR_KEY[model.error && model.error.kind] || ERROR_KEY.unknown;
    return el(doc, "div", { class: "cx-error", role: "alert" }, [
      el(doc, "div", { class: "cx-error-head", html: ICONS.warn + "<span>" + t(L, "errorTitle") + "</span>" }),
      el(doc, "div", { class: "cx-error-msg", text: t(L, key2) }),
      el(doc, "div", { class: "cx-error-acts" }, [
        el(doc, "button", { class: "cx-error-btn cx-error-pri", "data-act": "retry", text: t(L, "retry") }),
        el(doc, "button", { class: "cx-error-btn", "data-act": "report", text: t(L, "reportBug") })
      ])
    ]);
  }
  function rateBanner(doc, model) {
    if (!model.ratePrompt || model.state !== "ready") return null;
    const L = model.uiLang || model.current;
    return el(doc, "div", { class: "cx-rate" }, [
      el(doc, "span", { class: "cx-rate-star", text: "\u2605" }),
      el(doc, "span", { class: "cx-rate-text", text: t(L, "enjoying") }),
      el(doc, "button", { class: "cx-rate-btn cx-rate-pri", "data-act": "rate", text: t(L, "rateIt") }),
      el(doc, "button", { class: "cx-rate-btn", "data-act": "rate-later", text: t(L, "later") }),
      el(doc, "button", { class: "cx-icon-btn cx-rate-x", "data-act": "rate-never", "aria-label": t(L, "noThanks"), html: ICONS.x })
    ]);
  }
  function foot(doc, model) {
    const L = model.uiLang || model.current;
    const base = model.state === "estimated" ? t(L, "sharpening") : t(L, "metric");
    const note = model.total && model.total > 1 ? `${base} \xB7 ${t(L, "langsOf", { total: model.total })}` : base;
    return el(doc, "div", { class: "cx-foot" }, [
      el(doc, "span", { class: "cx-foot-note", text: note })
    ]);
  }
  function pill(doc, model) {
    const L = model.uiLang || model.current;
    const label = model.best ? nativeName(model.best.lang) : "\u2026";
    const theme = model.settings?.theme;
    const props = { class: "cx-pill", "data-act": "restore", "data-drag-handle": "1", style: `--cx-acc:${accentHex(model.settings?.accent)}`, "aria-label": t(L, "openApp") };
    if (theme && theme !== "auto") props["data-theme"] = theme;
    return el(doc, "button", props, [
      el(doc, "span", { html: ICONS.world }),
      el(doc, "span", { text: t(L, "best") + ": " + label }),
      el(doc, "span", { html: ICONS.chevronUp })
    ]);
  }
  function shell(doc, model, kids) {
    const L = model.uiLang || model.current;
    const theme = model.settings?.theme;
    const props = { class: "cx-card", dir: RTL.has(L) ? "rtl" : "ltr", role: "complementary", style: `--cx-acc:${accentHex(model.settings?.accent)}`, "aria-label": t(L, "openApp") };
    if (theme && theme !== "auto") props["data-theme"] = theme;
    return el(doc, "div", props, kids);
  }
  function buildCard(doc, model, handlers = {}) {
    if (model.minimized) return pill(doc, model);
    const L = model.uiLang || model.current;
    if (model.state === "error") return shell(doc, model, [head(doc, L), errorBlock(doc, model), foot(doc, model)]);
    let heroEl;
    if (model.state === "ready") heroEl = hero(doc, model);
    else heroEl = el(doc, "div", { class: "cx-loading", text: model.state === "estimated" ? t(L, "ranking") : t(L, "finding") });
    const colhead = el(doc, "div", { class: "cx-colhead" }, [
      el(doc, "span", { text: t(L, "language") }),
      el(doc, "span", { class: "cx-spacer" }),
      el(doc, "span", { class: "cx-colhead-stat", text: t(L, "wordsRefs") })
    ]);
    const rows = el(doc, "div", { class: "cx-rows" }, (model.ranked || []).map((l) => row(doc, model, l)));
    return shell(doc, model, [head(doc, L), heroEl, colhead, rows, rateBanner(doc, model), foot(doc, model)]);
  }
  function bind(node, handlers) {
    node.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      handlers.onClose?.();
    });
    node.addEventListener("click", (e) => {
      const tgt = e.target.closest("[data-act]");
      if (!tgt) return;
      const act = tgt.getAttribute("data-act");
      const lang = tgt.getAttribute("data-lang");
      const map = {
        min: handlers.onMinimize,
        close: handlers.onClose,
        restore: handlers.onRestore,
        open: () => handlers.onOpen?.(lang),
        translate: () => handlers.onTranslate?.(lang),
        lang: () => handlers.onClickLang?.(lang),
        rate: handlers.onRate,
        "rate-later": handlers.onRateLater,
        "rate-never": handlers.onRateNever,
        retry: handlers.onRetry,
        report: handlers.onReport
      };
      const fn = map[act];
      if (fn) {
        e.preventDefault();
        fn();
      }
    });
  }
  function attachDrag(host, node, onMoved) {
    const handle = node.querySelector("[data-drag-handle]") || node;
    let dragging = false, startX = 0, startY = 0, startTop = 0, startLeft = 0, moved = false;
    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".cx-icon-btn")) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = host.getBoundingClientRect();
      startTop = rect.top;
      startLeft = rect.left;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      const rect = host.getBoundingClientRect();
      const maxTop = Math.max(0, window.innerHeight - rect.height);
      const maxLeft = Math.max(0, window.innerWidth - rect.width);
      const top = Math.min(maxTop, Math.max(0, startTop + dy));
      const left = Math.min(maxLeft, Math.max(0, startLeft + dx));
      host.style.top = top + "px";
      host.style.left = left + "px";
      host.style.right = "auto";
    });
    handle.addEventListener("pointerup", () => {
      if (!dragging) return;
      dragging = false;
      if (moved && onMoved) onMoved({ top: parseFloat(host.style.top), left: parseFloat(host.style.left) });
    });
    handle.addEventListener("click", (e) => {
      if (moved) {
        e.stopImmediatePropagation();
        moved = false;
      }
    });
  }
  function renderCard(host, model, handlers = {}) {
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLES}</style>`;
    const card = buildCard(document, model, handlers);
    attachDrag(host, card, handlers.onMoved);
    bind(card, handlers);
    root.appendChild(card);
  }

  var MAX = 400;
  var entries = [];
  var store = null;
  var timer = null;
  var RAW = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };
  var key = "wikiweigherDebug";
  function setStore(s) {
    store = s;
  }
  function setStatus(value) {
    try {
      if (typeof document !== "undefined" && document.documentElement) {
        document.documentElement.dataset.wikiweigherStatus = value;
      }
    } catch {
    }
  }
  function mirror() {
    if (!store || timer) return;
    timer = setTimeout(async () => {
      timer = null;
      try {
        await store.set({ [key]: entries.slice(-MAX) });
      } catch {
      }
    }, 400);
  }
  function record(level, args) {
    const msg = args.map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (a && typeof a === "object") {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    }).join(" ");
    entries.push({ t: Date.now(), level, msg });
    if (entries.length > MAX) entries.shift();
    try {
      (RAW[level] || RAW.log)("[wikiweigher]", msg);
    } catch {
    }
    mirror();
  }
  var debug = {
    log: (...a) => record("log", a),
    info: (...a) => record("info", a),
    warn: (...a) => record("warn", a),
    error: (...a) => record("error", a)
  };
  function patchConsole(tag) {
    for (const level of ["error", "warn"]) {
      const orig = console[level];
      if (!orig || orig.__wwPatched) continue;
      const wrapped = function(...args) {
        try {
          record(level, [tag ? `[${tag}]` : "", ...args].filter(Boolean));
        } catch {
        }
        return orig.apply(console, args);
      };
      wrapped.__wwPatched = true;
      console[level] = wrapped;
    }
  }
  function extensionFrames(stack) {
    return String(stack).split("\n").filter((line) => !/https?:\/\//.test(line) || line.includes("chrome-extension://")).join("\n");
  }
  function install(tag = "") {
    const g = typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : null;
    if (!g || !g.addEventListener) return;
    patchConsole(tag);
    g.addEventListener("error", (e) => {
      record("error", [
        tag ? `[${tag}]` : "window.onerror",
        e.message || String(e),
        `${String(e.filename || "").startsWith("chrome-extension://") ? e.filename : "(page)"}:${e.lineno || ""}`,
        e.error && e.error.stack ? extensionFrames(e.error.stack) : ""
      ]);
    });
    g.addEventListener("unhandledrejection", (e) => {
      const r = e.reason;
      record("error", [
        tag ? `[${tag}] unhandledrejection` : "unhandledrejection",
        r && r.stack ? r.stack : String(r)
      ]);
    });
    g.addEventListener("securitypolicyviolation", (e) => {
      record("error", [
        "CSP refused",
        e.violatedDirective || "",
        String(e.blockedURI || "").slice(0, 160),
        e.sourceFile ? `at ${e.sourceFile}:${e.lineNumber || ""}` : ""
      ]);
    });
  }

  var BADGE = { Q17437796: "featured", Q17437798: "good" };
  function wikidataIdUrl(lang, title) {
    return `https://${lang}.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&maxlag=5&origin=*&titles=${encodeURIComponent(title)}`;
  }
  function entitiesUrl(qid) {
    return `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=sitelinks&format=json&origin=*`;
  }
  function dbnameFor(site) {
    return site.split(".")[0].replace(/-/g, "_") + "wiki";
  }
  async function getQualityBadges(lang, title, deps = {}) {
    const fetchJson2 = deps.fetchJson || fetchJson;
    const j = await fetchJson2(wikidataIdUrl(lang, title));
    const page = Object.values(j?.query?.pages || {})[0];
    const qid = page?.pageprops?.wikibase_item;
    if (!qid) return {};
    const j2 = await fetchJson2(entitiesUrl(qid));
    const links = j2?.entities?.[qid]?.sitelinks || {};
    const out = {};
    for (const [dbname, link] of Object.entries(links)) {
      const badge = (link.badges || []).map((b) => BADGE[b]).find(Boolean);
      if (badge) out[dbname] = badge;
    }
    return out;
  }

  var STORE_ID = "liepeplciapidcddoaihbemdhgijceja";
  var AMO_SLUG = "";
  var RATE_DEFAULTS = { runs: 0, next: 5, done: false };
  function num(v2, fb) {
    return typeof v2 === "number" && isFinite(v2) ? v2 : fb;
  }
  function recordRun(r) {
    return { ...r, runs: num(r.runs, 0) + 1 };
  }
  function published(gecko2 = false) {
    return gecko2 ? AMO_SLUG.length > 0 : STORE_ID.length > 0;
  }
  function shouldPrompt(r, storeReady = published()) {
    if (!storeReady) return false;
    return !r.done && num(r.runs, 0) >= num(r.next, RATE_DEFAULTS.next);
  }
  function later(r) {
    return { ...r, next: num(r.runs, 0) + 15 };
  }
  function never(r) {
    return { ...r, done: true };
  }
  function rated(r) {
    return { ...r, done: true };
  }
  function reviewsUrl(gecko2 = false) {
    if (!published(gecko2)) return "";
    return gecko2 ? "https://addons.mozilla.org/firefox/addon/" + AMO_SLUG + "/reviews/" : "https://chromewebstore.google.com/detail/" + STORE_ID + "/reviews";
  }
  async function getRate(store3) {
    const obj = await store3.get("wikiweigherRate");
    return { ...RATE_DEFAULTS, ...obj?.wikiweigherRate || {} };
  }
  async function setRate(r, store3) {
    await store3.set({ wikiweigherRate: r });
    return r;
  }

  var UA_BRANDS = [
    [/\bEdg(?:e|A|iOS)?\/(\d+)/, "Edge"],
    [/\bOPR\/(\d+)/, "Opera"],
    [/\bVivaldi\/(\d+)/, "Vivaldi"],
    [/\bFirefox\/(\d+)/, "Firefox"],
    [/\bChrome\/(\d+)/, "Chrome"],
    [/\bVersion\/(\d+).*\bSafari\//, "Safari"]
  ];
  function shortUA(ua) {
    if (typeof ua !== "string") return "unknown";
    for (const [re, name] of UA_BRANDS) {
      const m = re.exec(ua);
      if (m) return name + " " + m[1];
    }
    return "unknown";
  }
  function browserLabel(nav) {
    const brands = nav && nav.userAgentData && nav.userAgentData.brands;
    if (Array.isArray(brands)) {
      const real = brands.find((b) => b && typeof b.brand === "string" && !/not[.:/ ]?a[.:/ ]?brand/i.test(b.brand));
      if (real) return `${real.brand} ${String(real.version || "").split(".")[0]}`.trim();
    }
    return shortUA(nav && nav.userAgent);
  }
  function osLabel(nav) {
    const platform = nav && (nav.userAgentData && nav.userAgentData.platform || nav.platform);
    return typeof platform === "string" && platform ? platform : "unknown";
  }
  function diffFromDefaults(settings) {
    const out = {};
    if (!settings || typeof settings !== "object") return out;
    for (const key2 of Object.keys(DEFAULTS)) {
      if (!(key2 in settings)) continue;
      if (JSON.stringify(settings[key2]) === JSON.stringify(DEFAULTS[key2])) continue;
      out[key2] = settings[key2];
    }
    return out;
  }

  var ext = globalThis.browser ?? globalThis.chrome;
  var gecko = String(ext?.runtime?.getURL?.("") || "").startsWith("moz-extension://");

  var TTL = 7 * 24 * 60 * 60 * 1e3;
  var RUN_TIMEOUT = 45e3;
  var CANDIDATE_CAP = 50;
  var MAJOR = ["en", "de", "fr", "es", "ja", "ru", "it", "zh", "pt", "fa", "ar", "pl", "nl", "uk", "sv", "vi", "id", "ko", "tr", "fi", "cs", "hu", "ca", "sr", "ro", "no", "he", "bg", "da", "simple", "el", "hi", "th", "eu", "sk", "et", "be", "ml", "la", "ur", "hr", "lt", "sl", "az"];
  var HOST_ID = "wikiweigher-host";
  var store2 = typeof ext !== "undefined" && ext.storage && ext.storage.local || null;
  var MANIFEST = typeof ext !== "undefined" && ext.runtime && ext.runtime.getManifest ? ext.runtime.getManifest() : { version: "?" };
  install();
  setStore(store2);
  debug.info("boot", "v" + MANIFEST.version, typeof location !== "undefined" ? location.hostname : "");
  function snapSettings(s) {
    return diffFromDefaults(s);
  }
  function persistDiag(d) {
    if (d && d.phase) setStatus(d.errorKind ? "error:" + d.errorKind : d.phase);
    if (!store2) return;
    const base = { v: MANIFEST.version, ts: Date.now(), host: location.hostname, browser: browserLabel(navigator), os: osLabel(navigator) };
    store2.set({ wikiweigherDiag: { ...base, ...d } }).catch(() => {
    });
  }
  function mountHost(position) {
    let host = document.getElementById(HOST_ID);
    if (host) return host;
    host = document.createElement("div");
    host.id = HOST_ID;
    const pos = clampToViewport(position, window.innerWidth, window.innerHeight);
    host.style.cssText = pos ? `position:fixed;top:${pos.top}px;left:${pos.left}px;z-index:2147483000;` : "position:fixed;top:90px;right:16px;z-index:2147483000;";
    document.body.appendChild(host);
    return host;
  }
  function entryOf(state, lang) {
    return state.langs.find((l) => l.lang === lang) || {};
  }
  function articleUrl(site, title) {
    return `https://${site}/wiki/${encodeURIComponent((title || "").replace(/ /g, "_"))}`;
  }
  function draw(host, state, handlers) {
    const model = buildModel(state);
    model.ratePrompt = state.ratePrompt;
    renderCard(host, model, handlers);
  }
  async function analyze(lang, site, title) {
    const key2 = `x:${lang}:${title}`;
    if (store2) {
      const cached = await getCached(key2, store2);
      if (cached) return cached;
    }
    const r = await getExact(site, title);
    if (r && store2) await setCached(key2, r, TTL, store2);
    return r;
  }
  function makeHandlers(host, state) {
    const handlers = {
      onOpen: (lang) => {
        const e = entryOf(state, lang);
        window.open(articleUrl(e.site, e.title), "_blank", "noopener");
      },
      onTranslate: (lang) => {
        const e = entryOf(state, lang);
        const url = articleUrl(e.site, e.title);
        window.open(`https://translate.google.com/translate?sl=${lang}&tl=${state.current}&u=${encodeURIComponent(url)}`, "_blank", "noopener");
      },
      onMinimize: () => {
        state.minimized = true;
        if (store2) setLayout({ startMinimized: true }, store2);
        draw(host, state, handlers);
      },
      onRestore: () => {
        state.minimized = false;
        if (store2) setLayout({ startMinimized: false }, store2);
        draw(host, state, handlers);
      },
      onClose: () => host.remove(),
      onMoved: (pos) => {
        if (store2) setLayout({ position: pos }, store2);
      },
      onClickLang: async (lang) => {
        if (state.exact[lang]) {
          handlers.onOpen(lang);
          return;
        }
        const e = entryOf(state, lang);
        const r = await analyze(lang, e.site, e.title);
        if (r) {
          state.exact[lang] = r;
          draw(host, state, handlers);
        }
      },
      onRetry: () => {
        run().catch((e) => debug.error("retry crashed", e));
      },
      onReport: () => {
        try {
          ext.runtime.sendMessage({ type: "open-support" });
        } catch (e) {
          debug.error("report open failed", e);
        }
      },
      onRate: async () => {
        const url = reviewsUrl(gecko);
        if (url) window.open(url, "_blank", "noopener");
        state.ratePrompt = false;
        if (store2) await setRate(rated(await getRate(store2)), store2);
        draw(host, state, handlers);
      },
      onRateLater: async () => {
        state.ratePrompt = false;
        if (store2) await setRate(later(await getRate(store2)), store2);
        draw(host, state, handlers);
      },
      onRateNever: async () => {
        state.ratePrompt = false;
        if (store2) await setRate(never(await getRate(store2)), store2);
        draw(host, state, handlers);
      }
    };
    return handlers;
  }
  function pickCandidates(langs, current, reads2) {
    const have = new Set(langs.map((l) => l.lang));
    const order = [];
    const add = (c) => {
      if (have.has(c) && !order.includes(c)) order.push(c);
    };
    add(current);
    for (const c of reads2 || []) add(c);
    for (const c of MAJOR) add(c);
    for (const l of langs) add(l.lang);
    return order.slice(0, CANDIDATE_CAP).map((c) => langs.find((l) => l.lang === c));
  }
  var running = false;
  var pending = false;
  var lastRunKey = "";
  var lastDrawKey = "";
  var live = null;
  var watchdog = null;
  function clearWatchdog() {
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  }
  function armWatchdog(host, state, handlers, ctx, settings, started) {
    clearWatchdog();
    watchdog = setTimeout(() => {
      watchdog = null;
      if (state.state === "ready" || state.state === "error") return;
      if (!document.getElementById(HOST_ID)) return;
      state.state = "error";
      state.error = { kind: "timeout" };
      draw(host, state, handlers);
      debug.error("run timed out after " + RUN_TIMEOUT + "ms");
      persistDiag({ phase: "error", errorKind: "timeout", lang: ctx.lang, title: ctx.title, settings: snapSettings(settings), ms: Date.now() - started });
    }, RUN_TIMEOUT);
  }
  var migrated = false;
  async function ensureMigrated() {
    if (migrated || !store2) return;
    migrated = true;
    await migrate(store2);
  }
  function runKeyOf(s) {
    return [s.enabled, s.analyze, (s.languagesIRead || []).join(",")].join("|");
  }
  function drawKeyOf(s) {
    return [s.weight, s.theme, s.accent, s.cardLang].join("|");
  }
  function navLangs() {
    const nav = typeof navigator !== "undefined" ? navigator.languages || [navigator.language] : [];
    return nav.filter(Boolean).map((l) => l.split("-")[0]);
  }
  async function run() {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      do {
        pending = false;
        try {
          await runInner();
        } catch (e) {
          clearWatchdog();
          debug.error("run crashed", e);
          if (live && document.getElementById(HOST_ID)) {
            live.state.state = "error";
            live.state.error = { kind: "unknown" };
            draw(live.host, live.state, live.handlers);
            persistDiag({ phase: "error", errorKind: "unknown", message: String(e && e.message || e).slice(0, 300) });
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
    debug.info("context", JSON.stringify(ctx));
    if (!ctx) {
      persistDiag({ phase: "not-an-article" });
      return;
    }
    await ensureMigrated();
    const settings = await getSettings(store2);
    const layout2 = await getLayout(store2);
    lastRunKey = runKeyOf(settings);
    lastDrawKey = drawKeyOf(settings);
    if (!settings.languagesIRead || !settings.languagesIRead.length) settings.languagesIRead = navLangs();
    debug.info("settings enabled=" + settings.enabled + " weight=" + settings.weight + " analyze=" + settings.analyze);
    if (!settings.enabled) {
      persistDiag({ phase: "disabled", lang: ctx.lang, title: ctx.title, settings: snapSettings(settings) });
      return;
    }
    const state = {
      current: ctx.lang,
      uiLang: settings.cardLang && settings.cardLang !== "auto" ? settings.cardLang : ctx.lang,
      settings,
      minimized: layout2.startMinimized,
      langs: [],
      sizes: {},
      exact: {},
      state: "loading"
    };
    const host = mountHost(layout2.position);
    const handlers = makeHandlers(host, state);
    live = { host, state, handlers };
    setStatus("loading");
    draw(host, state, handlers);
    const fail = (rawKind, note) => {
      const kind = rawKind === "network" && typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : rawKind;
      clearWatchdog();
      state.state = "error";
      state.error = { kind };
      draw(host, state, handlers);
      debug.error("run failed kind=" + kind + (note ? " " + note : ""));
      persistDiag({ phase: "error", errorKind: kind, lang: ctx.lang, title: ctx.title, settings: snapSettings(settings), ms: Date.now() - started });
    };
    armWatchdog(host, state, handlers, ctx, settings, started);
    const allLangs = await getLanguages(ctx.lang, ctx.title);
    if (allLangs === null) {
      fail("network", "langlinks unreachable");
      return;
    }
    debug.info("languages found=" + allLangs.length);
    if (allLangs.length < 2) {
      clearWatchdog();
      host.remove();
      persistDiag({ phase: "too-few-languages", lang: ctx.lang, title: ctx.title, total: allLangs.length, settings: snapSettings(settings) });
      return;
    }
    if (typeof location !== "undefined" && allLangs[0]) allLangs[0].site = location.hostname;
    const badges = await getQualityBadges(ctx.lang, ctx.title);
    for (const l of allLangs) l.badge = badges[dbnameFor(l.site)] || null;
    debug.info("badges=" + Object.keys(badges).length);
    const candidates = pickCandidates(allLangs, state.current, settings.languagesIRead);
    debug.info("candidates=" + candidates.length + " of " + allLangs.length);
    state.langs = candidates;
    state.total = allLangs.length;
    state.state = "estimated";
    setStatus("estimated");
    draw(host, state, handlers);
    const sizes = await pool(candidates, 6, async (l) => [l.lang, await getQuickSize(l.site, l.title)]);
    for (const [lang, size] of sizes) state.sizes[lang] = size;
    debug.info("sizes done");
    draw(host, state, handlers);
    const N = Math.max(1, Math.min(settings.analyze || 12, candidates.length));
    const top = [...candidates].sort((a, b) => (state.sizes[b.lang] || 0) - (state.sizes[a.lang] || 0)).slice(0, N);
    if (!top.some((l) => l.lang === state.current)) {
      const cur = candidates.find((l) => l.lang === state.current);
      if (cur) {
        top.pop();
        top.push(cur);
      }
    }
    await pool(top, 4, async (l) => {
      const r = await analyze(l.lang, l.site, l.title);
      if (r) state.exact[l.lang] = r;
    });
    if (!Object.keys(state.exact).length) {
      fail("network", "no article could be analyzed");
      return;
    }
    clearWatchdog();
    state.state = "ready";
    debug.info("exact done=" + Object.keys(state.exact).length + " ready");
    if (store2) {
      const r = recordRun(await getRate(store2));
      await setRate(r, store2);
      state.ratePrompt = shouldPrompt(r, published(gecko));
    }
    draw(host, state, handlers);
    const model = buildModel(state);
    persistDiag({
      phase: "ready",
      lang: ctx.lang,
      title: ctx.title,
      settings: snapSettings(settings),
      total: state.total,
      candidates: candidates.length,
      analyzedCount: Object.keys(state.exact).length,
      analyzed: candidates.filter((l) => state.exact[l.lang]).map((l) => ({ lang: l.lang, site: l.site, words: state.exact[l.lang].words, refs: state.exact[l.lang].refs, badge: l.badge || null })),
      best: model.best ? { lang: model.best.lang, words: model.best.words, refs: model.best.refs } : null,
      bestSourced: model.bestSourced ? { lang: model.bestSourced.lang, refs: model.bestSourced.refs } : null,
      verdict: model.verdict ? model.verdict.type : null,
      ms: Date.now() - started
    });
  }
  function watchSettings() {
    if (!store2 || typeof ext === "undefined" || !ext.storage || !ext.storage.onChanged) return;
    ext.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.settings) return;
      const s = changes.settings.newValue || {};
      const old = changes.settings.oldValue || {};
      const host = document.getElementById(HOST_ID);
      const rk = runKeyOf(s);
      const dk = drawKeyOf(s);
      if (s.enabled === false) {
        if (host) host.remove();
        lastRunKey = rk;
        lastDrawKey = dk;
        return;
      }
      const reEnabled = old.enabled === false;
      if (!host && !reEnabled) {
        lastRunKey = rk;
        lastDrawKey = dk;
        return;
      }
      if (rk !== lastRunKey || reEnabled || !live) {
        lastRunKey = rk;
        lastDrawKey = dk;
        run().catch((e) => debug.error("reapply crashed", e));
        return;
      }
      if (dk === lastDrawKey) return;
      lastDrawKey = dk;
      const next = { ...s };
      if (!next.languagesIRead || !next.languagesIRead.length) next.languagesIRead = navLangs();
      live.state.settings = next;
      live.state.uiLang = next.cardLang && next.cardLang !== "auto" ? next.cardLang : live.state.current;
      draw(live.host, live.state, live.handlers);
    });
  }
  function init() {
    run().catch((e) => debug.error("run crashed", e));
  }
  watchSettings();
  init();
})();
