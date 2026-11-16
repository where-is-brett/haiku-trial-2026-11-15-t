// tests/export.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvField, isMonth, categoryLabel } from '../src/lib/export.js';

test('a field with a comma, a double quote or a line break is quoted, quotes doubled', () => {
  assert.equal(csvField('Pasta, Pizza & Co'), '"Pasta, Pizza & Co"');
  assert.equal(csvField('Say "hi"'), '"Say ""hi"""');
  assert.equal(csvField('Line one\nLine two'), '"Line one\nLine two"');
  assert.equal(csvField('Eating out'), 'Eating out');
});

test('isMonth accepts YYYY-MM for months 01 to 12 only', () => {
  assert.equal(isMonth('2026-08'), true);
  assert.equal(isMonth('2026-12'), true);
  for (const bad of ['2026-13', '2026-00', '2026-8', '2026-08-01', '26-08', '', null]) {
    assert.equal(isMonth(bad), false, bad);
  }
});

test('categoryLabel gives the label the month page shows, not the key', () => {
  assert.equal(categoryLabel('Pasta, Pizza & Co'), 'Eating out');
  assert.equal(categoryLabel('Unknown Shop'), 'Other');
});
