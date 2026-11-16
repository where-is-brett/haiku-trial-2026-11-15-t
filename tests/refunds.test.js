// tests/refunds.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createTable, importRows } from '../src/lib/store.js';
import { readStatement } from '../src/lib/statement.js';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { correctStoredRefunds, refundDuplicates, correctRefundFile } from '../src/lib/refunds.js';

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

test('a stored refund whose money-back row already exists is reported as a duplicate', () => {
  const db = fresh();
  add(db, '2026-09-15', 'Marlowe Homewares REFUND', 4000);
  add(db, '2026-09-15', 'Marlowe Homewares REFUND', -4000);
  assert.deepEqual(refundDuplicates(db), [{ date: '2026-09-15', description: 'Marlowe Homewares REFUND', cents: 4000 }]);
});

// Makes a ledger file in a fresh temp folder; returns its path and a cleanup.
const ledgerFile = (rows) => {
  const dir = mkdtempSync(join(tmpdir(), 'refunds-'));
  const path = join(dir, 'ledger.db');
  const db = new DatabaseSync(path);
  createTable(db);
  for (const [date, description, cents] of rows) add(db, date, description, cents);
  db.close();
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};
const fileRows = (path) => {
  const db = new DatabaseSync(path);
  const rows = db.prepare('SELECT cents FROM transactions ORDER BY id').all().map((r) => r.cents);
  db.close();
  return rows;
};

test('correctRefundFile backs up the ledger first, then corrects it', () => {
  const { path, cleanup } = ledgerFile([['2026-09-15', 'Marlowe Homewares REFUND', 4000]]);
  try {
    assert.deepEqual(correctRefundFile(path), { changed: 1, backupPath: `${path}.before-refund-fix` });
    assert.deepEqual(fileRows(`${path}.before-refund-fix`), [4000]);
    assert.deepEqual(fileRows(path), [-4000]);
  } finally {
    cleanup();
  }
});

test('a second run refuses to overwrite the backup, and changes nothing', () => {
  const { path, cleanup } = ledgerFile([['2026-09-15', 'Marlowe Homewares REFUND', 4000]]);
  try {
    correctRefundFile(path);
    assert.throws(() => correctRefundFile(path), /backup already exists/);
    assert.deepEqual(fileRows(`${path}.before-refund-fix`), [4000]);
    assert.deepEqual(fileRows(path), [-4000]);
  } finally {
    cleanup();
  }
});

test('a duplicate pair stops the run before any backup or change', () => {
  const { path, cleanup } = ledgerFile([
    ['2026-09-15', 'Marlowe Homewares REFUND', 4000],
    ['2026-09-15', 'Marlowe Homewares REFUND', -4000],
  ]);
  try {
    const result = correctRefundFile(path);
    assert.equal(result.duplicates.length, 1);
    assert.equal(existsSync(`${path}.before-refund-fix`), false);
    assert.deepEqual(fileRows(path), [4000, -4000]);
  } finally {
    cleanup();
  }
});
