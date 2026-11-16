// tests/dates.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthOf } from '../src/lib/dates.js';

test('monthOf reads a stored ISO date', () => {
  assert.equal(monthOf('2026-08-31'), '2026-08');
  assert.equal(monthOf('2026-09-01'), '2026-09');
});

test('monthOf still reads a DD/MM/YYYY date', () => {
  assert.equal(monthOf('31/08/2026'), '2026-08');
  assert.equal(monthOf('1/9/2026'), '2026-09');
});
