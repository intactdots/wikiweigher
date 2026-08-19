import { validatorFor } from './schema.js';

export const LAYOUT_KEY = 'wikiweigherLayout';

export const LAYOUT_SCHEMA = {
  position: { type: 'point', def: null },
  startMinimized: { type: 'boolean', def: false }
};

const v = validatorFor(LAYOUT_SCHEMA);

export const LAYOUT_DEFAULTS = v.DEFAULTS;

export function clampToViewport(pos, width, height) {
  if (!pos) return null;
  const maxTop = Math.max(0, height - 60);
  const maxLeft = Math.max(0, width - 60);
  return { top: Math.min(maxTop, Math.max(0, pos.top)), left: Math.min(maxLeft, Math.max(0, pos.left)) };
}

export async function getLayout(store) {
  let raw = null;
  try {
    raw = (await store.get(LAYOUT_KEY))?.[LAYOUT_KEY];
  } catch {
    raw = null;
  }
  return v.validateAll(raw);
}

export async function setLayout(patch, store) {
  const next = v.validateAll({ ...(await getLayout(store)), ...(patch || {}) });
  try {
    await store.set({ [LAYOUT_KEY]: next });
  } catch {
    return next;
  }
  return next;
}
