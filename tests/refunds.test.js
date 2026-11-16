// tests/refunds.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createTable, importRows } from '../src/lib/store.js';
import { readStatement } from '../src/lib/statement.js';
import { correctStoredRefunds } from '../src/lib/refunds.js';

const fresh = () => {
  const db = new DatabaseSync(':memory:');
  createTable(db);
  return db;
};
const add = (db, date, description, cents) =>
  db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)').run(date, description, cents);
const stored = (db) => db.prepare('SELECT date, description, cents FROM transactions ORDER BY id').all().map((r) => ({ ...r }));

test('a stored refund imported as spending becomes money back', () => {
  const db = fresh();
  add(db, '2026-09-15', 'Marlowe Homewares REFUND', 4000);
  assert.equal(correctStoredRefunds(db), 1);
  assert.deepEqual(stored(db), [{ date: '2026-09-15', description: 'Marlowe Homewares REFUND', cents: -4000 }]);
});

test('other stored rows keep their sign', () => {
  const db = fresh();
  add(db, '2026-09-02', 'Greenbarrow Fresh', 4520);
  add(db, '2026-09-15', 'Marlowe Homewares REFUND', -4000);
  add(db, '2026-09-10', 'Brightwave Payroll', 300000);
  assert.equal(correctStoredRefunds(db), 0);
  assert.deepEqual(
    stored(db).map((r) => r.cents),
    [4520, -4000, 300000],
  );
});

test('a re-import after the correction is skipped, not added again', () => {
  const db = fresh();
  add(db, '2026-09-15', 'Marlowe Homewares REFUND', 4000);
  correctStoredRefunds(db);
  const rows = readStatement('Date,Description,Amount\n15/09/2026,Marlowe Homewares REFUND,40.00');
  assert.deepEqual(importRows(db, rows), { added: 0, skipped: 1 });
  assert.equal(stored(db).length, 1);
});
