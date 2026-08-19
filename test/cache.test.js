import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCached, setCached, evictIfFull, PREFIX, MAX_BYTES } from '../src/core/cache.js';

function memStore(bytes) {
  const m = {};
  const store = {
    async get(k) {
      if (k === null) return { ...m };
      return k in m ? { [k]: m[k] } : {};
    },
    async set(o) { Object.assign(m, o); },
    async remove(k) { for (const key of Array.isArray(k) ? k : [k]) delete m[key]; },
    keys() { return Object.keys(m); }
  };
  if (bytes != null) store.getBytesInUse = async () => bytes;
  return store;
}

test('returns cached data before expiry', async () => {
  const store = memStore();
  await setCached('a', { x: 1 }, 10000, store);
  assert.deepEqual(await getCached('a', store), { x: 1 });
});

test('returns null after expiry', async () => {
  const store = memStore();
  await setCached('b', { x: 2 }, -1, store);
  assert.equal(await getCached('b', store), null);
});

test('returns null for a missing key', async () => {
  const store = memStore();
  assert.equal(await getCached('missing', store), null);
});

test('expired entry is deleted from storage on read', async () => {
  const store = memStore();
  await setCached('c', { x: 3 }, -1, store);
  assert.equal(await getCached('c', store), null);
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(store.keys(), []);
});

test('read survives a store without remove', async () => {
  const store = memStore();
  delete store.remove;
  await setCached('d', { x: 4 }, -1, store);
  assert.equal(await getCached('d', store), null);
});

test('cache entries are namespaced so a sweep cannot touch settings', async () => {
  const store = memStore();
  await setCached('x:en:Everest', { words: 1 }, 10000, store);
  assert.deepEqual(store.keys(), [PREFIX + 'x:en:Everest']);
});

test('under the byte ceiling nothing is evicted', async () => {
  const store = memStore(MAX_BYTES - 1);
  await store.set({ settings: { weight: 0.5 } });
  await setCached('keep', { x: 1 }, 10000, store);
  assert.equal(await evictIfFull(store), 0);
  assert.deepEqual(await getCached('keep', store), { x: 1 });
});

test('at the byte ceiling every cache key is dropped and settings survive', async () => {
  const store = memStore(MAX_BYTES);
  await store.set({ settings: { weight: 0.5 }, wikiweigherDiag: { phase: 'ready' } });
  await store.set({ [PREFIX + 'a']: 1, [PREFIX + 'b']: 2 });
  assert.equal(await evictIfFull(store), 2);
  assert.deepEqual(store.keys().sort(), ['settings', 'wikiweigherDiag']);
});

test('a write past the ceiling clears first, then stores', async () => {
  const store = memStore(MAX_BYTES);
  await store.set({ [PREFIX + 'old']: { data: 1, expires: Date.now() + 9999 } });
  await setCached('fresh', { x: 2 }, 10000, store);
  assert.equal(await getCached('old', store), null);
  assert.deepEqual(await getCached('fresh', store), { x: 2 });
});

test('a store with no getBytesInUse never evicts', async () => {
  const store = memStore();
  await store.set({ [PREFIX + 'a']: 1 });
  assert.equal(await evictIfFull(store), 0);
});

test('a write rejection is reported, not thrown', async () => {
  const store = memStore();
  store.set = async () => { throw new Error('QUOTA_BYTES quota exceeded'); };
  assert.equal(await setCached('e', { x: 5 }, 10000, store), false);
});
