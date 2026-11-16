// tests/store.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTable, importRows, setCategory } from '../src/lib/store.js';
import { readStatement } from '../src/lib/statement.js';

const row = (date, description, cents) => ({ date, description, cents });
const newDb = () => {
  const db = new DatabaseSync(':memory:');
  createTable(db);
  return db;
};
const count = (db) => db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n;

test('the same rows imported twice are added once', () => {
  const db = newDb();
  const rows = [row('2026-08-02', 'Skyline Broadband REF 0617', 858), row('2026-08-03', 'Hollis Insurance', -12350)];
  assert.deepEqual(importRows(db, rows), { added: 2, skipped: 0 });
  assert.deepEqual(importRows(db, rows), { added: 0, skipped: 2 });
  assert.equal(count(db), 2);
});

test('a row stored once and present twice in the file adds one and skips one', () => {
  const db = newDb();
  importRows(db, [row('2026-08-02', 'Kestrel Coffee Bar', 650)]);
  const again = [row('2026-08-02', 'Kestrel Coffee Bar', 650), row('2026-08-02', 'Kestrel Coffee Bar', 650)];
  assert.deepEqual(importRows(db, again), { added: 1, skipped: 1 });
  assert.equal(count(db), 2);
});

test('two identical rows in one file with nothing stored are both added', () => {
  const db = newDb();
  const twice = [row('2026-08-02', 'Kestrel Coffee Bar', 650), row('2026-08-02', 'Kestrel Coffee Bar', 650)];
  assert.deepEqual(importRows(db, twice), { added: 2, skipped: 0 });
  assert.deepEqual(importRows(db, twice), { added: 0, skipped: 2 });
  assert.equal(count(db), 2);
});

test('same date and description with a different amount is not a duplicate', () => {
  const db = newDb();
  importRows(db, [row('2026-08-02', 'Kestrel Coffee Bar', 650)]);
  assert.deepEqual(importRows(db, [row('2026-08-02', 'Kestrel Coffee Bar', 700)]), { added: 1, skipped: 0 });
  assert.equal(count(db), 2);
});

test('descriptions are trimmed before they are stored and compared', () => {
  const db = newDb();
  importRows(db, [row('2026-08-02', '  Kestrel Coffee Bar ', 650)]);
  assert.deepEqual(importRows(db, [row('2026-08-02', 'Kestrel Coffee Bar', 650)]), { added: 0, skipped: 1 });
  assert.equal(db.prepare('SELECT description FROM transactions').get().description, 'Kestrel Coffee Bar');
});

test('the sample statement imports as 128 added, then 128 skipped', () => {
  const text = fs.readFileSync(fileURLToPath(new URL('../data/sample-statement.csv', import.meta.url)), 'utf8');
  const rows = readStatement(text).map(({ date, description, cents }) => ({ date, description, cents }));
  const db = newDb();
  assert.deepEqual(importRows(db, rows), { added: 128, skipped: 0 });
  assert.deepEqual(importRows(db, rows), { added: 0, skipped: 128 });
});

test('a failure part-way stores nothing from that file', () => {
  const db = newDb();
  importRows(db, [row('2026-08-01', 'Before', 100)]);
  db.exec("CREATE TRIGGER fail_on_boom BEFORE INSERT ON transactions WHEN NEW.description = 'BOOM' BEGIN SELECT RAISE(ABORT, 'boom'); END;");
  const file = [row('2026-08-02', 'First', 200), row('2026-08-03', 'BOOM', 300), row('2026-08-04', 'Last', 400)];
  assert.throws(() => importRows(db, file), /boom/);
  assert.equal(count(db), 1);
});

test('an imported row gets the category its shop name gives', () => {
  const db = newDb();
  importRows(db, [row('2026-08-02', 'Greenbarrow Fresh', -4500), row('2026-08-03', 'Unknown Shop', -100)]);
  const categories = db.prepare('SELECT category FROM transactions ORDER BY id').all().map((r) => r.category);
  assert.deepEqual(categories, ['groceries', 'other']);
});

test("a re-import keeps a moved row's category", () => {
  const db = newDb();
  const rows = [row('2026-08-02', 'Greenbarrow Fresh', -4500)];
  importRows(db, rows);
  setCategory(db, 1, 'dining');
  assert.deepEqual(importRows(db, rows), { added: 0, skipped: 1 });
  assert.equal(db.prepare('SELECT category FROM transactions WHERE id = 1').get().category, 'dining');
});

test('a table made before the column existed gains it, and its rows have no category', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE transactions (id INTEGER PRIMARY KEY, date TEXT, description TEXT, cents INTEGER)');
  db.exec("INSERT INTO transactions (date, description, cents) VALUES ('2026-08-02', 'Greenbarrow Fresh', -4500)");
  createTable(db);
  assert.equal(db.prepare('SELECT category FROM transactions').get().category, null);
  assert.deepEqual(importRows(db, [row('2026-08-02', 'Greenbarrow Fresh', -4500)]), { added: 0, skipped: 1 });
});
