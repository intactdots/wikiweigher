import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, stepToV1, VERSION, VERSION_KEY } from '../src/settings/migrate.js';
import { LAYOUT_KEY, getLayout } from '../src/settings/layout.js';
import { getSettings } from '../src/settings/settings.js';

function memStore(seed = {}) {
  const m = { ...seed };
  return {
    raw: m,
    async get(k) {
      const keys = Array.isArray(k) ? k : [k];
      const out = {};
      for (const key of keys) if (key in m) out[key] = m[key];
      return out;
    },
    async set(o) { Object.assign(m, o); }
  };
}

const V0 = {
  weight: 0.75,
  preset: 'complete',
  languagesIRead: ['en', 'sv'],
  enabled: true,
  startMinimized: true,
  cardLang: 'auto',
  analyze: 24,
  theme: 'dark',
  accent: 'teal',
  position: { top: 140, left: 320 }
};

test('a real v0 blob splits into settings and layout', () => {
  const out = stepToV1(V0);
  assert.equal('preset' in out.settings, false);
  assert.equal('position' in out.settings, false);
  assert.equal('startMinimized' in out.settings, false);
  assert.equal(out.settings.weight, 0.75);
  assert.equal(out.settings.accent, 'teal');
  assert.deepEqual(out.layout.position, { top: 140, left: 320 });
  assert.equal(out.layout.startMinimized, true);
});

test('migrating a v0 store preserves what the user chose', async () => {
  const store = memStore({ settings: V0 });
  const result = await migrate(store);
  assert.deepEqual(result, { from: 0, to: VERSION, ran: true });
  const s = await getSettings(store);
  assert.equal(s.analyze, 24);
  assert.equal(s.theme, 'dark');
  assert.deepEqual(s.languagesIRead, ['en', 'sv']);
  assert.deepEqual((await getLayout(store)).position, { top: 140, left: 320 });
  assert.equal(store.raw[VERSION_KEY], VERSION);
});

test('migration is idempotent', async () => {
  const store = memStore({ settings: V0 });
  await migrate(store);
  const second = await migrate(store);
  assert.equal(second.ran, false);
  assert.deepEqual((await getLayout(store)).position, { top: 140, left: 320 });
});

test('an empty store migrates to defaults without throwing', async () => {
  const store = memStore();
  const result = await migrate(store);
  assert.equal(result.ran, true);
  assert.equal((await getSettings(store)).weight, 0.5);
  assert.equal((await getLayout(store)).position, null);
  assert.ok(LAYOUT_KEY in store.raw);
});

test('a store that rejects leaves the extension usable', async () => {
  const broken = { async get() { throw new Error('nope'); }, async set() { throw new Error('nope'); } };
  assert.deepEqual(await migrate(broken), { from: 0, to: 0, ran: false });
});

test('a write failure does not claim the migration ran', async () => {
  const store = { async get() { return { settings: V0 }; }, async set() { throw new Error('quota'); } };
  const result = await migrate(store);
  assert.equal(result.ran, false);
});
