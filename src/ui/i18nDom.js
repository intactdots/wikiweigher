import { ext as chrome } from '../core/ext.js';
const RTL = new Set(['ar', 'fa', 'he', 'ur', 'ps', 'sd', 'ckb', 'yi', 'dv']);

export function msg(key, params) {
  try {
    return chrome.i18n.getMessage(key, params) || '';
  } catch {
    return '';
  }
}

export function applyI18n(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    const text = msg(node.dataset.i18n);
    if (text) node.textContent = text;
  }
  for (const node of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of node.dataset.i18nAttr.split(',')) {
      const [attr, key] = pair.split(':');
      const text = msg(key);
      if (attr && text) node.setAttribute(attr, text);
    }
  }
  let ui = 'en';
  try {
    ui = chrome.i18n.getUILanguage() || 'en';
  } catch {}
  document.documentElement.lang = ui;
  if (RTL.has(ui.split('-')[0])) document.documentElement.dir = 'rtl';
}
