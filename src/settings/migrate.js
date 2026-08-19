import { validateAll as validateSettings, validatorFor } from './schema.js';
import { LAYOUT_KEY, LAYOUT_SCHEMA } from './layout.js';

const layout = validatorFor(LAYOUT_SCHEMA);

export const VERSION = 1;
export const VERSION_KEY = 'wikiweigherSchema';

export function stepToV1(legacySettings) {
  const src = legacySettings && typeof legacySettings === 'object' ? legacySettings : {};
  return {
    settings: validateSettings(src),
    layout: layout.validateAll({ position: src.position, startMinimized: src.startMinimized })
  };
}

export async function migrate(store) {
  let current = 0;
  let legacy = null;
  try {
    const obj = await store.get([VERSION_KEY, 'settings']);
    current = Number(obj?.[VERSION_KEY]) || 0;
    legacy = obj?.settings || null;
  } catch {
    return { from: 0, to: 0, ran: false };
  }
  if (current >= VERSION) return { from: current, to: current, ran: false };
  const next = stepToV1(legacy);
  try {
    await store.set({ settings: next.settings, [LAYOUT_KEY]: next.layout, [VERSION_KEY]: VERSION });
  } catch {
    return { from: current, to: current, ran: false };
  }
  return { from: current, to: VERSION, ran: true };
}
