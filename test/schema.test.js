import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA, DEFAULTS, CARD_LANGS, validate, validateAll, presetOf, PRESET_WEIGHT } from '../src/settings/schema.js';
import { LANGS } from '../src/ui/i18n.js';
import { ACCENTS } from '../src/ui/accents.js';

test('every schema key exposes a default and DEFAULTS mirrors them', () => {
  for (const [key, def] of Object.entries(SCHEMA)) {
    assert.ok('def' in def, key + ' has no default');
    assert.deepEqual(DEFAULTS[key], def.def, key + ' default mismatch');
  }
  assert.deepEqual(Object.keys(DEFAULTS).sort(), Object.keys(SCHEMA).sort());
});

test('preset is derived, never stored', () => {
  assert.equal('preset' in SCHEMA, false);
});

test('a wrong type falls back to the default for every key', () => {
  const junk = [null, undefined, {}, () => {}, NaN, 'nonsense'];
  for (const key of Object.keys(SCHEMA)) {
    for (const bad of junk) {
      assert.deepEqual(validate(key, bad), DEFAULTS[key], `${key} accepted ${String(bad)}`);
    }
  }
});

test('numbers clamp into range instead of resetting', () => {
  assert.equal(validate('weight', 1.4), 1);
  assert.equal(validate('weight', -3), 0);
  assert.equal(validate('weight', 0.65), 0.65);
});

test('a non-finite number falls back rather than clamping', () => {
  assert.equal(validate('weight', Infinity), DEFAULTS.weight);
  assert.equal(validate('weight', '0.75'), DEFAULTS.weight);
});

test('enums reject values outside their list', () => {
  assert.equal(validate('analyze', 7), DEFAULTS.analyze);
  assert.equal(validate('analyze', 24), 24);
  assert.equal(validate('theme', 'sepia'), DEFAULTS.theme);
  assert.equal(validate('theme', 'dark'), 'dark');
  assert.equal(validate('accent', 'chartreuse'), DEFAULTS.accent);
  assert.equal(validate('accent', 'teal'), 'teal');
  assert.equal(validate('cardLang', 'xx'), DEFAULTS.cardLang);
  assert.equal(validate('cardLang', 'ja'), 'ja');
});

test('booleans reject truthy strings', () => {
  assert.equal(validate('enabled', 'false'), DEFAULTS.enabled);
  assert.equal(validate('enabled', 1), DEFAULTS.enabled);
  assert.equal(validate('enabled', false), false);
});

test('language codes are normalised, deduped and capped', () => {
  assert.deepEqual(validate('languagesIRead', [' EN ', 'pt-BR', 'de']), ['en', 'pt', 'de']);
  assert.deepEqual(validate('languagesIRead', ['en', 'EN', 'en-GB']), ['en']);
  assert.deepEqual(validate('languagesIRead', ['en', 7, null, 'fr']), ['en', 'fr']);
  assert.deepEqual(validate('languagesIRead', ['toolongcode', 'x']), []);
  const alpha = 'abcdefghijklmnopqrstuvwxyz';
  const many = Array.from({ length: 50 }, (_, i) => alpha[Math.floor(i / 26)] + alpha[i % 26]);
  assert.equal(validate('languagesIRead', many).length, SCHEMA.languagesIRead.max);
});

test('validateAll drops unknown keys and fills missing ones', () => {
  const out = validateAll({ weight: 0.75, evil: 'payload', analyze: 999 });
  assert.equal(out.weight, 0.75);
  assert.equal(out.analyze, DEFAULTS.analyze);
  assert.equal('evil' in out, false);
  assert.deepEqual(Object.keys(out).sort(), Object.keys(SCHEMA).sort());
});

test('validateAll survives a non-object', () => {
  assert.deepEqual(validateAll(null), DEFAULTS);
  assert.deepEqual(validateAll('corrupt'), DEFAULTS);
});

test('presetOf names the three presets and calls anything else custom', () => {
  assert.equal(presetOf(0.5), 'balanced');
  assert.equal(presetOf(0.75), 'complete');
  assert.equal(presetOf(0.25), 'sourced');
  assert.equal(presetOf(0.6), 'custom');
  for (const [name, weight] of Object.entries(PRESET_WEIGHT)) {
    assert.equal(presetOf(weight), name);
  }
});

test('the card language list matches the shipped translations', () => {
  assert.deepEqual([...CARD_LANGS].sort(), [...LANGS].sort());
});

test('the accent enum matches the shipped swatches', () => {
  assert.deepEqual([...SCHEMA.accent.values].sort(), Object.keys(ACCENTS).sort());
});
