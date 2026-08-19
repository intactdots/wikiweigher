import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSettings, setSettings, DEFAULTS, presetOf } from '../src/settings/settings.js';

function memStore() {
  const m = {};
  return {
    async get(k) { return k in m ? { [k]: m[k] } : {}; },
    async set(o) { Object.assign(m, o); }
  };
}

test('returns defaults when the store is empty', async () => {
  const s = await getSettings(memStore());
  assert.deepEqual(s, DEFAULTS);
});

test('defaults include auto card language and an analysis count', async () => {
  const s = await getSettings(memStore());
  assert.equal(s.cardLang, 'auto');
  assert.equal(s.analyze, 12);
});

test('defaults include an auto theme', async () => {
  const s = await getSettings(memStore());
  assert.equal(s.theme, 'auto');
});

test('patch merges with existing and persists', async () => {
  const store = memStore();
  const next = await setSettings({ weight: 0.75 }, store);
  assert.equal(next.weight, 0.75);
  assert.equal(next.enabled, true);
  assert.equal((await getSettings(store)).weight, 0.75);
});

test('the preset is derived from the weight, never stored', async () => {
  const store = memStore();
  const next = await setSettings({ weight: 0.25, preset: 'complete' }, store);
  assert.equal('preset' in next, false);
  assert.equal(presetOf(next.weight), 'sourced');
});

test('a corrupt stored blob never reaches the caller', async () => {
  const store = memStore();
  await store.set({ settings: { weight: 'heavy', analyze: 999, theme: 'sepia', enabled: 'yes', languagesIRead: 'en', junk: 1 } });
  const s = await getSettings(store);
  assert.deepEqual(s, DEFAULTS);
});

test('a store that throws on read yields defaults instead of rejecting', async () => {
  const s = await getSettings({ async get() { throw new Error('storage unavailable'); } });
  assert.deepEqual(s, DEFAULTS);
});
