const MAX = 400;
const entries = [];
let store = null;
let timer = null;

const RAW = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

let key = 'wikiweigherDebug';

export function setStore(s) {
  store = s;
}

export function setKey(k) {
  key = k;
}

export function setStatus(value) {
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.wikiweigherStatus = value;
    }
  } catch {}
}

function mirror() {
  if (!store || timer) return;
  timer = setTimeout(async () => {
    timer = null;
    try {
      await store.set({ [key]: entries.slice(-MAX) });
    } catch {}
  }, 400);
}

export function record(level, args) {
  const msg = args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (a && typeof a === 'object') {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');
  entries.push({ t: Date.now(), level, msg });
  if (entries.length > MAX) entries.shift();
  try { (RAW[level] || RAW.log)('[wikiweigher]', msg); } catch {}
  mirror();
}

export const debug = {
  log: (...a) => record('log', a),
  info: (...a) => record('info', a),
  warn: (...a) => record('warn', a),
  error: (...a) => record('error', a)
};

export function getEntries() {
  return entries.slice();
}

export function formatLog() {
  return entries.map(e => `${new Date(e.t).toISOString().slice(11, 23)} ${e.level.toUpperCase()} ${e.msg}`).join('\n');
}

function patchConsole(tag) {
  for (const level of ['error', 'warn']) {
    const orig = console[level];
    if (!orig || orig.__wwPatched) continue;
    const wrapped = function (...args) {
      try { record(level, [tag ? `[${tag}]` : '', ...args].filter(Boolean)); } catch {}
      return orig.apply(console, args);
    };
    wrapped.__wwPatched = true;
    console[level] = wrapped;
  }
}

function extensionFrames(stack) {
  return String(stack).split('\n')
    .filter(line => !/https?:\/\//.test(line) || line.includes('chrome-extension://'))
    .join('\n');
}

export function install(tag = '') {
  const g = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : null);
  if (!g || !g.addEventListener) return;
  patchConsole(tag);
  g.addEventListener('error', e => {
    record('error', [tag ? `[${tag}]` : 'window.onerror', e.message || String(e),
      `${String(e.filename || '').startsWith('chrome-extension://') ? e.filename : '(page)'}:${e.lineno || ''}`, e.error && e.error.stack ? extensionFrames(e.error.stack) : '']);
  });
  g.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    record('error', [tag ? `[${tag}] unhandledrejection` : 'unhandledrejection',
      r && r.stack ? r.stack : String(r)]);
  });
  g.addEventListener('securitypolicyviolation', e => {
    record('error', ['CSP refused', e.violatedDirective || '',
      String(e.blockedURI || '').slice(0, 160), e.sourceFile ? `at ${e.sourceFile}:${e.lineNumber || ''}` : '']);
  });
}
