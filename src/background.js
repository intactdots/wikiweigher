import { getSettings, setSettings } from './settings/settings.js';
import { setStore, setKey, install } from './core/debug.js';

const store = chrome.storage.local;
const UPDATED_KEY = 'wikiweigherUpdated';

setStore(store);
setKey('wikiweigherDebugSw');
install('service worker');

async function markUpdated(version) {
  await store.set({ [UPDATED_KEY]: version });
  await chrome.action.setBadgeText({ text: '\u2022' });
  await chrome.action.setBadgeBackgroundColor({ color: '#0078d4' });
}

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/welcome.html') });
    return;
  }
  if (details.reason === 'update') markUpdated(chrome.runtime.getManifest().version).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[UPDATED_KEY]) return;
  if (changes[UPDATED_KEY].newValue) return;
  chrome.action.setBadgeText({ text: '' }).catch(() => {});
});

chrome.runtime.onMessage.addListener(msg => {
  if (msg?.type !== 'open-support') return;
  chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#diag') }).catch(() => {});
});

chrome.commands.onCommand.addListener(async command => {
  if (command !== 'toggle-enabled') return;
  const current = await getSettings(store);
  await setSettings({ enabled: !current.enabled }, store);
});
