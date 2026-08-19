import { DEFAULTS, PRESET_WEIGHT, presetOf, validate, validateAll } from './schema.js';

export { DEFAULTS, PRESET_WEIGHT, presetOf, validate, validateAll };

export async function getSettings(store) {
  let raw = null;
  try {
    raw = (await store.get('settings'))?.settings;
  } catch {
    raw = null;
  }
  return validateAll(raw);
}

export async function setSettings(patch, store) {
  const next = validateAll({ ...(await getSettings(store)), ...(patch || {}) });
  await store.set({ settings: next });
  return next;
}
