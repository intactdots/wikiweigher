import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLayout, setLayout, clampToViewport, LAYOUT_DEFAULTS, LAYOUT_KEY } from '../src/settings/layout.js';
import { getSettings, setSettings } from '../src/settings/settings.js';

function memStore() {
  const m = {};
  return {
    raw: m,
    async get(k) { return k in m ? { [k]: m[k] } : {}; },
    async set(o) { await Promise.resolve(); Object.assign(m, o); }
  };
}

test('layout defaults to no position and not minimized', async () => {
  assert.deepEqual(await getLayout(memStore()), LAYOUT_DEFAULTS);
  assert.equal(LAYOUT_DEFAULTS.position, null);
  assert.equal(LAYOUT_DEFAULTS.startMinimized, false);
});

test('a position round-trips through its own key', async () => {
  const store = memStore();
  await setLayout({ position: { top: 120, left: 400 } }, store);
  assert.deepEqual((await getLayout(store)).position, { top: 120, left: 400 });
  assert.ok(LAYOUT_KEY in store.raw);
});

test('a corrupt position is discarded rather than rendered', async () => {
  const store = memStore();
  await store.set({ [LAYOUT_KEY]: { position: { top: 'high', left: NaN }, startMinimized: 'yes' } });
  const layout = await getLayout(store);
  assert.equal(layout.position, null);
  assert.equal(layout.startMinimized, false);
});

test('negative coordinates are pulled back on screen', async () => {
  const store = memStore();
  await setLayout({ position: { top: -500, left: -20 } }, store);
  assert.deepEqual((await getLayout(store)).position, { top: 0, left: 0 });
});

test('clampToViewport keeps the card reachable on a small window', () => {
  assert.deepEqual(clampToViewport({ top: 5000, left: 5000 }, 800, 600), { top: 540, left: 740 });
  assert.deepEqual(clampToViewport({ top: 10, left: 10 }, 800, 600), { top: 10, left: 10 });
  assert.equal(clampToViewport(null, 800, 600), null);
});

test('a layout write and a settings write in the same tick both survive', async () => {
  const store = memStore();
  await Promise.all([
    setLayout({ position: { top: 7, left: 9 } }, store),
    setSettings({ accent: 'teal' }, store)
  ]);
  assert.deepEqual((await getLayout(store)).position, { top: 7, left: 9 });
  assert.equal((await getSettings(store)).accent, 'teal');
});

test('settings no longer carry layout keys', async () => {
  const s = await getSettings(memStore());
  assert.equal('position' in s, false);
  assert.equal('startMinimized' in s, false);
});
