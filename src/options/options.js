import { getSettings, setSettings, presetOf, PRESET_WEIGHT, DEFAULTS, validateAll } from '../settings/settings.js';
import { getLayout, setLayout, LAYOUT_KEY } from '../settings/layout.js';
import { migrate } from '../settings/migrate.js';
import { ACCENTS, accentHex } from '../ui/accents.js';
import { reviewsUrl, published } from '../core/rate.js';
import { reportUrl, repoUrl, mailtoUrl, mergeLogs, LOG_KEYS } from '../core/report.js';
import { applyI18n, msg } from '../ui/i18nDom.js';
import { ext as chrome, gecko } from '../core/ext.js';

const store = chrome.storage.local;

const els = {
  weight: document.getElementById('weight'),
  weightLabel: document.getElementById('weight-label'),
  languages: document.getElementById('languages'),
  enabled: document.getElementById('enabled'),
  startMinimized: document.getElementById('startMinimized'),
  cardLang: document.getElementById('cardLang')
};

function applyTheme(theme) {
  if (theme && theme !== 'auto') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
function applyAccent(accent) {
  document.documentElement.style.setProperty('--acc', accentHex(accent));
}
function weightText(weight) {
  return `${Math.round(weight * 100)}% depth / ${Math.round((1 - weight) * 100)}% sources`;
}
function markSeg(id, key, value) {
  for (const b of document.querySelectorAll('#' + id + ' button')) {
    const on = b.dataset[key] === value;
    b.classList.toggle('a', on);
    b.setAttribute('aria-pressed', String(on));
  }
}

function buildAccents() {
  const wrap = document.getElementById('accents');
  wrap.innerHTML = '';
  for (const [name, hex] of Object.entries(ACCENTS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'acd';
    b.dataset.accent = name;
    b.style.setProperty('--dot', hex);
    b.setAttribute('aria-label', name);
    b.addEventListener('click', async () => { applyAccent(name); await setSettings({ accent: name }, store); render(await getSettings(store)); });
    wrap.appendChild(b);
  }
}

function render(s, layout) {
  els.weight.value = String(s.weight);
  els.languages.value = (s.languagesIRead || []).join(', ');
  els.enabled.checked = s.enabled;
  if (layout) els.startMinimized.checked = layout.startMinimized;
  els.cardLang.value = s.cardLang || 'auto';
  els.weightLabel.textContent = weightText(s.weight);
  markSeg('presets', 'p', presetOf(s.weight));
  markSeg('analyze', 'a', String(s.analyze || 12));
  markSeg('themes', 't', s.theme || 'auto');
  for (const b of document.querySelectorAll('#accents .acd')) b.classList.toggle('a', b.dataset.accent === (s.accent || 'blue'));
  applyTheme(s.theme);
  applyAccent(s.accent);
}

async function save(patch) {
  render(await setSettings(patch, store));
}

function parseLanguages(text) {
  return text.split(',').map(s => s.trim().toLowerCase().split('-')[0]).filter(Boolean);
}

function showPane(name) {
  for (const b of document.querySelectorAll('.rb')) {
    const on = b.dataset.pane === name;
    b.classList.toggle('a', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  for (const sec of document.querySelectorAll('.pane [data-view]')) sec.hidden = sec.dataset.view !== name;
  if (name === 'diag') renderDiag();
  if (name === 'about') renderAbout();
}

let aboutDone = false;
async function renderAbout() {
  if (aboutDone) return;
  aboutDone = true;
  const m = chrome.runtime.getManifest();
  store.remove('wikiweigherUpdated');
  document.getElementById('ab-version').textContent = 'v' + m.version;
  document.getElementById('ab-source').href = repoUrl();
  const rate = document.getElementById('ab-rate');
  if (published(gecko)) rate.href = reviewsUrl(gecko);
  else rate.closest('.vr').hidden = true;
  const box = document.getElementById('ab-changelog');
  try {
    const md = await (await fetch(chrome.runtime.getURL('CHANGELOG.md'))).text();
    box.textContent = md.replace(/^# Changelog\s*/i, '').replace(/^## /gm, '').replace(/\*\*/g, '').trim();
  } catch (e) {
    box.textContent = 'Changelog unavailable in this build.';
  }
}

function bdg(kind, text) { return `<span class="bdg ${kind}">${text}</span>`; }
function hrow(name, value, badgeHtml) {
  return `<div class="hrow"><span class="hn">${name}</span><span class="hv">${value ?? ''}</span>${badgeHtml || ''}</div>`;
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function renderDiag() {
  const obj = await store.get(['wikiweigherDiag', ...LOG_KEYS]);
  const d = obj.wikiweigherDiag;
  const log = mergeLogs(obj);
  const health = document.getElementById('health');
  const errBox = document.getElementById('errors');
  const errTitle = document.getElementById('errors-title');
  const m = chrome.runtime.getManifest();

  const errors = log.filter(e => e.level === 'error');
  renderReport();

  if (!d) {
    health.innerHTML = hrow('Extension version', 'v' + m.version, bdg('green', 'ok')) +
      hrow('Last article run', 'none yet', bdg('amber', 'open a page'));
  } else {
    const phaseBadge = d.phase === 'ready' ? bdg('green', 'ready')
      : d.phase === 'disabled' ? bdg('amber', 'off')
        : bdg('amber', d.phase || 'idle');
    const ago = Math.max(0, Math.round((Date.now() - d.ts) / 1000));
    const st = { ...DEFAULTS, ...(d.settings || {}) };
    let rows = '';
    rows += hrow('Extension version', 'v' + esc(d.v), d.v === m.version ? bdg('green', 'ok') : bdg('amber', 'reload'));
    rows += hrow('Last run', ago < 90 ? ago + 's ago' : Math.round(ago / 60) + 'm ago', phaseBadge);
    rows += hrow('Article', d.title ? esc(d.title) + ' (' + esc(d.lang) + ')' : esc(d.host), '');
    if (d.phase === 'ready') {
      rows += hrow('Ranking', `${presetOf(st.weight)} (${weightText(st.weight)})`, '');
      rows += hrow('Deep-analyze', String(st.analyze), '');
      rows += hrow('Languages found', esc(String(d.total)), '');
      rows += hrow('Analyzed (exact)', esc(`${d.analyzedCount} of ${d.candidates} candidates`), d.analyzedCount >= 1 ? bdg('green', 'ok') : bdg('amber', 'none'));
      rows += hrow('Best pick', d.best ? `${esc(d.best.lang)} · ${esc(d.best.words)}w · ${esc(d.best.refs)}r` : 'none', '');
      if (d.bestSourced && d.best && d.bestSourced.lang !== d.best.lang) rows += hrow('Best sourced', `${esc(d.bestSourced.lang)} · ${d.bestSourced.refs}r`, '');
      rows += hrow('Verdict', esc(d.verdict), '');
      rows += hrow('Run time', esc(d.ms) + ' ms', d.ms < 12000 ? bdg('green', 'ok') : bdg('amber', 'slow'));
    }
    rows += hrow('Theme / accent', `${esc(st.theme)} / ${esc(st.accent)}`, '');
    rows += hrow('Languages you read', esc((st.languagesIRead || []).join(', ')) || 'auto', '');
    rows += hrow('Errors captured', String(errors.length), errors.length ? bdg('amber', String(errors.length)) : bdg('green', '0'));
    health.innerHTML = rows;
  }

  if (errors.length) {
    errTitle.hidden = false;
    errBox.innerHTML = errors.slice(-8).reverse().map(e => `<div class="rm"><span class="rmt">${new Date(e.t).toISOString().slice(11, 19)}</span><span class="rmm">${esc(e.msg).slice(0, 400)}</span></div>`).join('');
  } else {
    errTitle.hidden = true;
    errBox.innerHTML = '';
  }
}

async function currentReport() {
  const obj = await store.get(['wikiweigherDiag', ...LOG_KEYS]);
  return reportUrl(obj.wikiweigherDiag, mergeLogs(obj));
}

async function renderReport() {
  const { body } = await currentReport();
  document.getElementById('reportBody').textContent = body;
}

async function openReport() {
  const { url, overflow, body } = await currentReport();
  if (overflow) {
    if (!confirm(msg('confirmOverflow'))) return;
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      flash(msg('msgNoClipboard'));
      return;
    }
    flash(msg('msgPasteIt'));
  }
  window.open(url, '_blank', 'noopener');
}

async function emailReport() {
  const obj = await store.get(['wikiweigherDiag', ...LOG_KEYS]);
  const version = chrome.runtime.getManifest().version;
  const { url, inlined, body } = mailtoUrl(obj.wikiweigherDiag, mergeLogs(obj), version);

  if (!inlined) {
    download('wikiweigher-report.txt', body);
    try {
      await navigator.clipboard.writeText(body);
      flash(msg('msgMailFallback') || 'Diagnostics copied and saved as a file. Attach or paste it into the email.');
    } catch {
      flash(msg('msgMailFallbackFile') || 'Diagnostics saved as a file. Attach it to the email.');
    }
  }
  window.open(url, '_blank', 'noopener');
}

async function copyReport() {
  const { body } = await currentReport();
  try {
    await navigator.clipboard.writeText(body);
    const c = document.getElementById('copied');
    c.hidden = false;
    setTimeout(() => { c.hidden = true; }, 1400);
  } catch {
    flash(msg('msgNoClipboard'));
  }
}

async function downloadReport() {
  const { body } = await currentReport();
  download('wikiweigher-report.txt', body);
}

function flash(text) {
  const el = document.getElementById('dataMsg');
  el.textContent = text;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 2200);
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportSettings() {
  const payload = { wikiweigher: chrome.runtime.getManifest().version, settings: await getSettings(store), layout: await getLayout(store) };
  download('wikiweigher-settings.json', JSON.stringify(payload, null, 2));
  flash(msg('msgExported'));
}

async function importSettings(file) {
  let parsed = null;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    flash(msg('msgBadFile'));
    return;
  }
  const incoming = parsed && typeof parsed === 'object' ? (parsed.settings || parsed) : null;
  if (!incoming || typeof incoming !== 'object') {
    flash(msg('msgBadFile'));
    return;
  }
  await setSettings(validateAll(incoming), store);
  if (parsed.layout) await setLayout(parsed.layout, store);
  render(await getSettings(store), await getLayout(store));
  flash(msg('msgImported'));
}

async function resetSettings() {
  if (!confirm(msg('confirmReset'))) return;
  await setSettings(DEFAULTS, store);
  await setLayout({ position: null, startMinimized: false }, store);
  render(await getSettings(store), await getLayout(store));
  flash(msg('msgReset'));
}

async function init() {
  applyI18n();
  buildAccents();
  await migrate(store);
  render(await getSettings(store), await getLayout(store));

  for (const b of document.querySelectorAll('#presets button')) b.addEventListener('click', () => save({ weight: PRESET_WEIGHT[b.dataset.p] }));
  for (const b of document.querySelectorAll('#analyze button')) b.addEventListener('click', () => save({ analyze: Number(b.dataset.a) }));
  for (const b of document.querySelectorAll('#themes button')) b.addEventListener('click', () => save({ theme: b.dataset.t }));
  els.weight.addEventListener('input', () => { els.weightLabel.textContent = weightText(Number(els.weight.value)); });
  els.weight.addEventListener('change', () => save({ weight: Number(els.weight.value) }));
  els.languages.addEventListener('change', () => save({ languagesIRead: parseLanguages(els.languages.value) }));
  els.enabled.addEventListener('change', () => save({ enabled: els.enabled.checked }));
  els.startMinimized.addEventListener('change', () => setLayout({ startMinimized: els.startMinimized.checked }, store));
  els.cardLang.addEventListener('change', () => save({ cardLang: els.cardLang.value }));

  const rail = [...document.querySelectorAll('.rb')];
  for (const b of rail) b.addEventListener('click', () => showPane(b.dataset.pane));
  document.querySelector('.rail').addEventListener('keydown', e => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    const jump = e.key === 'Home' ? 0 : e.key === 'End' ? rail.length - 1 : null;
    if (step === undefined && jump === null) return;
    e.preventDefault();
    const at = rail.findIndex(b => b.getAttribute('aria-selected') === 'true');
    const next = rail[jump !== null ? jump : (at + step + rail.length) % rail.length];
    showPane(next.dataset.pane);
    next.focus();
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || (!changes.settings && !changes[LAYOUT_KEY])) return;
    render(await getSettings(store), await getLayout(store));
    if (!document.querySelector('[data-view="diag"]').hidden) renderDiag();
  });

  document.getElementById('diagRefresh').addEventListener('click', renderDiag);
  document.getElementById('setExport').addEventListener('click', exportSettings);
  document.getElementById('setReset').addEventListener('click', resetSettings);
  const fileInput = document.getElementById('setFile');
  document.getElementById('setImport').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) importSettings(fileInput.files[0]); fileInput.value = ''; });
  document.getElementById('diagCopy').addEventListener('click', copyReport);
  document.getElementById('reportOpen').addEventListener('click', openReport);
document.getElementById('reportEmail').addEventListener('click', emailReport);
  document.getElementById('reportDownload').addEventListener('click', downloadReport);

  const hash = location.hash.slice(1);
  showPane(['ranking', 'display', 'reading', 'diag', 'about'].includes(hash) ? hash : 'ranking');
}

init();
