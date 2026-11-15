// tests/months.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createTable } from '../src/lib/store.js';
import { listMonths } from '../src/lib/months.js';

const withRows = (dates) => {
  const db = new DatabaseSync(':memory:');
  createTable(db);
  const insert = db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)');
  dates.forEach((date, i) => insert.run(date, `Row ${i}`, 100));
  return db;
};

test('an empty table has no months', () => {
  assert.deepEqual(listMonths(withRows([])), []);
});

test('months come back newest first across a year boundary', () => {
  const db = withRows(['2025-12-31', '2026-01-02', '2026-12-01', '2026-08-15']);
  assert.deepEqual(listMonths(db), ['2026-12', '2026-08', '2026-01', '2025-12']);
});

test('a month with many rows appears once, and a gap month does not appear', () => {
  const db = withRows(['2026-08-01', '2026-08-02', '2026-08-30', '2026-10-05']);
  assert.deepEqual(listMonths(db), ['2026-10', '2026-08']);
});

test('the sample statement months are the three months it covers', () => {
  const db = new DatabaseSync(':memory:');
  createTable(db);
  db.exec("INSERT INTO transactions (date, description, cents) VALUES ('2026-08-02', 'A', 1), ('2026-09-05', 'B', 2), ('2026-10-31', 'C', 3)");
  assert.deepEqual(listMonths(db), ['2026-10', '2026-09', '2026-08']);
});
