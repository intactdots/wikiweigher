import { getSettings } from '../settings/settings.js';
import { migrate } from '../settings/migrate.js';
import { accentHex } from '../ui/accents.js';

const store = chrome.storage.local;

document.getElementById('ver').textContent = 'v' + chrome.runtime.getManifest().version;
document.getElementById('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

migrate(store).then(async () => {
  const s = await getSettings(store);
  if (s.theme && s.theme !== 'auto') document.documentElement.dataset.theme = s.theme;
  document.documentElement.style.setProperty('--acc', accentHex(s.accent));
});

const steps = [...document.querySelectorAll('.step')];
const dots = [...document.querySelectorAll('.dot')];
const prev = document.getElementById('prev');
const next = document.getElementById('next');
const live = document.getElementById('live');
const last = steps.length - 1;
let at = 0;

function show(n) {
  at = Math.max(0, Math.min(last, n));
  steps.forEach((s, i) => { s.hidden = i !== at; });
  dots.forEach((d, i) => {
    d.setAttribute('aria-selected', String(i === at));
    d.tabIndex = i === at ? 0 : -1;
  });
  prev.hidden = at === 0;
  next.hidden = at === last;
  live.textContent = `Step ${at + 1} of ${steps.length}`;
}

prev.addEventListener('click', () => show(at - 1));
next.addEventListener('click', () => show(at + 1));
dots.forEach((d, i) => d.addEventListener('click', () => show(i)));

document.getElementById('skip').addEventListener('click', () => {
  window.close();
  setTimeout(() => show(last), 120);
});

addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'ArrowRight') { show(at + 1); e.preventDefault(); }
  else if (e.key === 'ArrowLeft') { show(at - 1); e.preventDefault(); }
  else if (e.key === 'Home') { show(0); e.preventDefault(); }
  else if (e.key === 'End') { show(last); e.preventDefault(); }
});

show(0);
