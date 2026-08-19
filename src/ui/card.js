import { STYLES } from './styles.js';
import { ICONS } from './icons.js';
import { nativeName, englishName } from './langNames.js';
import { t } from './i18n.js';
import { accentHex } from './accents.js';

const RTL = new Set(['ar', 'fa', 'he', 'ur', 'ps', 'sd', 'ckb', 'yi', 'dv', 'arz', 'azb', 'ckb']);

function fmtK(n) {
  if (n == null) return '';
  return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n);
}

function el(doc, tag, props = {}, kids = []) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const kid of kids) if (kid) node.appendChild(kid);
  return node;
}

function iconBtn(doc, act, label, icon) {
  return el(doc, 'button', { class: 'cx-icon-btn', 'data-act': act, 'aria-label': label, html: icon });
}

function badgeEl(doc, lang, badge) {
  return el(doc, 'span', { class: 'cx-badge cx-badge-' + badge, text: '★', title: t(lang, badge) });
}

function reads(model, lang) {
  return (model.settings?.languagesIRead || []).includes(lang);
}

function head(doc, lang) {
  return el(doc, 'div', { class: 'cx-head', 'data-drag-handle': '1' }, [
    el(doc, 'span', { class: 'cx-head-title', html: ICONS.world + '<span>Wikiweigher</span>' }),
    el(doc, 'span', { class: 'cx-spacer' }),
    iconBtn(doc, 'min', t(lang, 'minimize'), ICONS.minus),
    iconBtn(doc, 'close', t(lang, 'close'), ICONS.x)
  ]);
}

function reasonText(L, best) {
  if (best.words == null) return best.refs != null ? `${best.refs} ${t(L, 'refsWord')}` : '';
  return `${fmtK(best.words)} ${t(L, 'words')} · ${best.refs} ${t(L, 'refsWord')}`;
}

function sourcedLine(doc, L, model, shownLang) {
  const bs = model.bestSourced;
  if (!bs || !model.best || bs.lang === shownLang || !(bs.refs > model.best.refs)) return null;
  const isCur = bs.lang === model.current;
  const link = el(doc, 'button', { class: 'cx-sourced-link', 'data-act': 'open', 'data-lang': bs.lang }, [
    el(doc, 'span', { text: nativeName(bs.lang) + ' · ' + bs.refs + ' ' }),
    el(doc, 'span', { html: ICONS.external })
  ]);
  const kids = [
    el(doc, 'span', { class: 'cx-sourced-icon', html: ICONS.bookmark }),
    el(doc, 'span', { class: 'cx-sourced-label', text: t(L, 'bestSourcedLabel') }),
    link
  ];
  if (isCur) kids.push(el(doc, 'span', { class: 'cx-you', text: t(L, 'here') }));
  return el(doc, 'div', { class: 'cx-sourced' }, kids);
}

function hero(doc, model) {
  const L = model.uiLang || model.current;
  const staying = model.verdict?.type === 'stay';
  const onCurrent = staying && (model.ranked || []).find(r => r.lang === model.current);
  const best = onCurrent || model.best;
  const isCurrentBest = best.lang === model.current;

  const nameRow = [
    el(doc, 'span', { class: 'cx-best-name', text: nativeName(best.lang) }),
    best.badge ? badgeEl(doc, L, best.badge) : null
  ];
  if (isCurrentBest) {
    nameRow.push(el(doc, 'span', { class: 'cx-you', text: t(L, 'here') }));
    nameRow.push(el(doc, 'span', { class: 'cx-spacer' }));
  } else {
    nameRow.push(el(doc, 'span', { class: 'cx-best-en', text: englishName(best.lang) }));
    nameRow.push(el(doc, 'span', { class: 'cx-spacer' }));
    nameRow.push(el(doc, 'button', { class: 'cx-open', 'data-act': 'open', 'data-lang': best.lang, html: t(L, 'open') + ' ' + ICONS.external }));
  }

  const kids = [
    el(doc, 'div', { class: 'cx-best-label', text: t(L, 'bestOverall') }),
    el(doc, 'div', { class: 'cx-best-main' }, nameRow)
  ];
  if (isCurrentBest) {
    kids.push(el(doc, 'div', { class: 'cx-best-reason', text: t(L, 'amongBestSub') }));
  } else {
    kids.push(el(doc, 'div', { class: 'cx-best-reason', text: reasonText(L, best) }));
    if (!reads(model, best.lang)) {
      kids.push(el(doc, 'button', { class: 'cx-translate', 'data-act': 'translate', 'data-lang': best.lang, html: ICONS.translate + ' ' + t(L, 'translate') }));
    }
  }
  const sourced = sourcedLine(doc, L, model, best.lang);
  if (sourced) kids.push(sourced);
  return el(doc, 'div', { class: 'cx-best' }, kids);
}

function row(doc, model, l) {
  const L = model.uiLang || model.current;
  const isCur = l.lang === model.current;
  let cls = 'cx-row';
  if (isCur) cls += ' cx-current';
  if (model.best && l.lang === model.best.lang) cls += ' cx-top';
  const stat = l.estimated ? '~ · ~' : `${fmtK(l.words)} · ${l.refs ?? '-'}`;
  const fill = el(doc, 'span', { class: 'cx-bar-fill', style: `width:${Math.round((l.score || 0) * 100)}%` });
  const nameKids = [el(doc, 'span', { class: 'cx-name-text', text: nativeName(l.lang) })];
  if (l.badge) nameKids.push(badgeEl(doc, L, l.badge));
  if (isCur) nameKids.push(el(doc, 'span', { class: 'cx-you', text: t(L, 'here') }));
  const aria = `${englishName(l.lang)}${isCur ? ' (' + t(L, 'current') + ')' : ''}${l.estimated ? '' : ', ' + l.words + ' ' + t(L, 'words')}${l.badge ? ', ' + t(L, l.badge) : ''}`;
  return el(doc, 'button', { class: cls, 'data-act': 'lang', 'data-lang': l.lang, title: englishName(l.lang), 'aria-label': aria }, [
    el(doc, 'span', { class: 'cx-row-name' }, nameKids),
    el(doc, 'span', { class: 'cx-bar' }, [fill]),
    el(doc, 'span', { class: 'cx-row-stat', text: stat })
  ]);
}

const ERROR_KEY = { network: 'errNetwork', timeout: 'errTimeout', offline: 'errOffline', unknown: 'errUnknown' };

function errorBlock(doc, model) {
  const L = model.uiLang || model.current;
  const key = ERROR_KEY[model.error && model.error.kind] || ERROR_KEY.unknown;
  return el(doc, 'div', { class: 'cx-error', role: 'alert' }, [
    el(doc, 'div', { class: 'cx-error-head', html: ICONS.warn + '<span>' + t(L, 'errorTitle') + '</span>' }),
    el(doc, 'div', { class: 'cx-error-msg', text: t(L, key) }),
    el(doc, 'div', { class: 'cx-error-acts' }, [
      el(doc, 'button', { class: 'cx-error-btn cx-error-pri', 'data-act': 'retry', text: t(L, 'retry') }),
      el(doc, 'button', { class: 'cx-error-btn', 'data-act': 'report', text: t(L, 'reportBug') })
    ])
  ]);
}

function rateBanner(doc, model) {
  if (!model.ratePrompt || model.state !== 'ready') return null;
  const L = model.uiLang || model.current;
  return el(doc, 'div', { class: 'cx-rate' }, [
    el(doc, 'span', { class: 'cx-rate-star', text: '★' }),
    el(doc, 'span', { class: 'cx-rate-text', text: t(L, 'enjoying') }),
    el(doc, 'button', { class: 'cx-rate-btn cx-rate-pri', 'data-act': 'rate', text: t(L, 'rateIt') }),
    el(doc, 'button', { class: 'cx-rate-btn', 'data-act': 'rate-later', text: t(L, 'later') }),
    el(doc, 'button', { class: 'cx-icon-btn cx-rate-x', 'data-act': 'rate-never', 'aria-label': t(L, 'noThanks'), html: ICONS.x })
  ]);
}

function foot(doc, model) {
  const L = model.uiLang || model.current;
  const base = model.state === 'estimated' ? t(L, 'sharpening') : t(L, 'metric');
  const note = model.total && model.total > 1 ? `${base} · ${t(L, 'langsOf', { total: model.total })}` : base;
  return el(doc, 'div', { class: 'cx-foot' }, [
    el(doc, 'span', { class: 'cx-foot-note', text: note })
  ]);
}

function pill(doc, model) {
  const L = model.uiLang || model.current;
  const label = model.best ? nativeName(model.best.lang) : '…';
  const theme = model.settings?.theme;
  const props = { class: 'cx-pill', 'data-act': 'restore', 'data-drag-handle': '1', style: `--cx-acc:${accentHex(model.settings?.accent)}`, 'aria-label': t(L, 'openApp') };
  if (theme && theme !== 'auto') props['data-theme'] = theme;
  return el(doc, 'button', props, [
    el(doc, 'span', { html: ICONS.world }),
    el(doc, 'span', { text: t(L, 'best') + ': ' + label }),
    el(doc, 'span', { html: ICONS.chevronUp })
  ]);
}

function shell(doc, model, kids) {
  const L = model.uiLang || model.current;
  const theme = model.settings?.theme;
  const props = { class: 'cx-card', dir: RTL.has(L) ? 'rtl' : 'ltr', role: 'complementary', style: `--cx-acc:${accentHex(model.settings?.accent)}`, 'aria-label': t(L, 'openApp') };
  if (theme && theme !== 'auto') props['data-theme'] = theme;
  return el(doc, 'div', props, kids);
}

export function buildCard(doc, model, handlers = {}) {
  if (model.minimized) return pill(doc, model);
  const L = model.uiLang || model.current;
  if (model.state === 'error') return shell(doc, model, [head(doc, L), errorBlock(doc, model), foot(doc, model)]);
  let heroEl;
  if (model.state === 'ready') heroEl = hero(doc, model);
  else heroEl = el(doc, 'div', { class: 'cx-loading', text: model.state === 'estimated' ? t(L, 'ranking') : t(L, 'finding') });
  const colhead = el(doc, 'div', { class: 'cx-colhead' }, [
    el(doc, 'span', { text: t(L, 'language') }),
    el(doc, 'span', { class: 'cx-spacer' }),
    el(doc, 'span', { class: 'cx-colhead-stat', text: t(L, 'wordsRefs') })
  ]);
  const rows = el(doc, 'div', { class: 'cx-rows' }, (model.ranked || []).map(l => row(doc, model, l)));
  return shell(doc, model, [head(doc, L), heroEl, colhead, rows, rateBanner(doc, model), foot(doc, model)]);
}

function bind(node, handlers) {
  node.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    handlers.onClose?.();
  });
  node.addEventListener('click', e => {
    const tgt = e.target.closest('[data-act]');
    if (!tgt) return;
    const act = tgt.getAttribute('data-act');
    const lang = tgt.getAttribute('data-lang');
    const map = {
      min: handlers.onMinimize,
      close: handlers.onClose,
      restore: handlers.onRestore,
      open: () => handlers.onOpen?.(lang),
      translate: () => handlers.onTranslate?.(lang),
      lang: () => handlers.onClickLang?.(lang),
      rate: handlers.onRate,
      'rate-later': handlers.onRateLater,
      'rate-never': handlers.onRateNever,
      retry: handlers.onRetry,
      report: handlers.onReport
    };
    const fn = map[act];
    if (fn) { e.preventDefault(); fn(); }
  });
}

function attachDrag(host, node, onMoved) {
  const handle = node.querySelector('[data-drag-handle]') || node;
  let dragging = false, startX = 0, startY = 0, startTop = 0, startLeft = 0, moved = false;
  handle.addEventListener('pointerdown', e => {
    if (e.target.closest('.cx-icon-btn')) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = host.getBoundingClientRect();
    startTop = rect.top;
    startLeft = rect.left;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    const rect = host.getBoundingClientRect();
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const top = Math.min(maxTop, Math.max(0, startTop + dy));
    const left = Math.min(maxLeft, Math.max(0, startLeft + dx));
    host.style.top = top + 'px';
    host.style.left = left + 'px';
    host.style.right = 'auto';
  });
  handle.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    if (moved && onMoved) onMoved({ top: parseFloat(host.style.top), left: parseFloat(host.style.left) });
  });
  handle.addEventListener('click', e => {
    if (moved) { e.stopImmediatePropagation(); moved = false; }
  });
}

export function renderCard(host, model, handlers = {}) {
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${STYLES}</style>`;
  const card = buildCard(document, model, handlers);
  attachDrag(host, card, handlers.onMoved);
  bind(card, handlers);
  root.appendChild(card);
}
