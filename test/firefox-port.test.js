import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const bundle = readFileSync(new URL('../firefox/dist/background.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../firefox/manifest.json', import.meta.url), 'utf8'));

function promiseApi(data, hooks) {
  return {
    storage: {
      local: {
        async get(k) {
          if (k == null) return { ...data };
          if (Array.isArray(k)) return Object.fromEntries(k.filter(x => x in data).map(x => [x, data[x]]));
          return k in data ? { [k]: data[k] } : {};
        },
        async set(obj) { Object.assign(data, obj); }
      },
      onChanged: { addListener() {} }
    },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} },
      getManifest: () => ({ version: '1.0.0' }),
      getURL: p => 'moz-extension://x/' + p
    },
    tabs: { async create() {} },
    commands: { onCommand: { addListener(fn) { hooks.command = fn; } } }
  };
}

function callbackApi(data, hooks) {
  return {
    storage: {
      local: {
        get(k, cb) { if (cb) cb({}); },
        set(obj, cb) { Object.assign(data, obj); if (cb) cb(); }
      },
      onChanged: { addListener() {} }
    },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} },
      getManifest: () => ({ version: '1.0.0' }),
      getURL: p => 'moz-extension://x/' + p
    },
    tabs: { create() {} },
    commands: { onCommand: { addListener(fn) { hooks.command = fn; } } }
  };
}

function boot(code, { withBrowser }) {
  const data = {};
  const hooks = {};
  const sandbox = { console, setTimeout, clearTimeout, Date, Math, JSON };
  sandbox.chrome = callbackApi(data, hooks);
  if (withBrowser) sandbox.browser = promiseApi(data, hooks);
  sandbox.globalThis = sandbox;
  runInContext(code, createContext(sandbox));
  return { data, hooks };
}

test('the firefox manifest is what gecko needs', () => {
  assert.equal(manifest.background.service_worker, undefined, 'gecko cannot run a service worker background');
  assert.deepEqual(manifest.background.scripts, ['dist/background.js']);
  assert.match(manifest.browser_specific_settings.gecko.id, /@/);
});

test('both bundles carry the api accessor from source', () => {
  const content = readFileSync(new URL('../firefox/dist/content.js', import.meta.url), 'utf8');
  for (const [name, code] of [['background', bundle], ['content', content]]) {
    assert.match(code, /globalThis\.browser \?\? globalThis\.chrome/, `${name} bundle is missing src/core/ext.js`);
  }
});

test('on firefox the toggle command actually flips the stored setting', async () => {
  const { data, hooks } = boot(bundle, { withBrowser: true });
  assert.equal(typeof hooks.command, 'function', 'no command listener registered');

  await hooks.command('toggle-enabled');
  assert.equal(data.settings.enabled, false, 'first toggle should turn it off');

  await hooks.command('toggle-enabled');
  assert.equal(data.settings.enabled, true, 'second toggle should turn it back on');
});

test('without the accessor the same code silently forgets the stored setting', async () => {
  const unshimmed = bundle.replace('globalThis.browser ?? globalThis.chrome', 'globalThis.chrome');
  assert.doesNotMatch(unshimmed, /globalThis\.browser/, 'the accessor was not neutralised');

  const { data, hooks } = boot(unshimmed, { withBrowser: true });
  await hooks.command('toggle-enabled');
  assert.equal(data.settings.enabled, false);

  await hooks.command('toggle-enabled');
  assert.equal(data.settings.enabled, false, 'it reads back nothing, so it never toggles on again');
});
