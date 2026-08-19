export const PREFIX = 'wwc:';
export const MAX_BYTES = 2 * 1024 * 1024;

export async function evictIfFull(store) {
  if (!store || typeof store.getBytesInUse !== 'function' || typeof store.remove !== 'function') return 0;
  let bytes = 0;
  try {
    bytes = await store.getBytesInUse(null);
  } catch {
    return 0;
  }
  if (!(bytes >= MAX_BYTES)) return 0;
  try {
    const all = await store.get(null);
    const keys = Object.keys(all || {}).filter(k => k.startsWith(PREFIX));
    if (keys.length) await store.remove(keys);
    return keys.length;
  } catch {
    return 0;
  }
}

export async function getCached(key, store) {
  const full = PREFIX + key;
  let entry = null;
  try {
    entry = (await store.get(full))?.[full];
  } catch {
    return null;
  }
  if (!entry) return null;
  if (entry.expires && entry.expires < Date.now()) { store.remove?.(full); return null; }
  return entry.data;
}

export async function setCached(key, data, ttlMs, store) {
  await evictIfFull(store);
  try {
    await store.set({ [PREFIX + key]: { data, expires: Date.now() + ttlMs } });
  } catch {
    return false;
  }
  return true;
}
