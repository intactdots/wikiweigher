import { getSettings, setSettings, presetOf, PRESET_WEIGHT } from '../settings/settings.js';
import { migrate } from '../settings/migrate.js';
import { accentHex } from '../ui/accents.js';
import { applyI18n } from '../ui/i18nDom.js';

const store = chrome.storage.local;
const enabled = document.getElementById('enabled');

function markSegs(id, key, value) {
  for (const b of document.querySelectorAll('#' + id + ' button')) b.classList.toggle('on', b.dataset[key] === value);
}
function applyTheme(theme) {
  if (theme && theme !== 'auto') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
async function render() {
  const s = await getSettings(store);
  enabled.checked = s.enabled;
  markSegs('presets', 'p', presetOf(s.weight));
  markSegs('completeness', 'a', String(s.analyze || 12));
  applyTheme(s.theme);
  document.documentElement.style.setProperty('--acc', accentHex(s.accent));
}

enabled.addEventListener('change', () => setSettings({ enabled: enabled.checked }, store));
for (const b of document.querySelectorAll('#presets button')) b.addEventListener('click', async () => { await setSettings({ weight: PRESET_WEIGHT[b.dataset.p] }, store); render(); });
for (const b of document.querySelectorAll('#completeness button')) b.addEventListener('click', async () => { await setSettings({ analyze: Number(b.dataset.a) }, store); render(); });
document.getElementById('more').addEventListener('click', () => { chrome.runtime.openOptionsPage(); window.close(); });
document.getElementById('about').addEventListener('click', () => { chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#about') }); window.close(); });
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.settings) render(); });

applyI18n();
store.remove('wikiweigherUpdated');
migrate(store).then(render);
