import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verbosity, calibratedDepth } from '../src/core/verbosity.js';

test('verbose Romance languages get a factor above 1', () => {
  assert.ok(verbosity('es') > 1);
  assert.ok(verbosity('fr') > 1);
  assert.ok(verbosity('pt') > 1);
});

test('compact languages get a factor below 1', () => {
  assert.ok(verbosity('ru') < 1);
  assert.ok(verbosity('fi') < 1);
  assert.ok(verbosity('de') < 1);
});

test('english and unknown languages default to 1', () => {
  assert.equal(verbosity('en'), 1);
  assert.equal(verbosity('zz'), 1);
});

test('calibratedDepth deflates verbose and inflates compact', () => {
  assert.ok(calibratedDepth('es', 1100) < 1100);
  assert.ok(calibratedDepth('ru', 920) > 920);
  assert.equal(calibratedDepth('en', 1000), 1000);
});
