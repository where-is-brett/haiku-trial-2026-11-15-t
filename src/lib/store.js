// src/lib/store.js

import { categoryOf } from './categories.js';

export function createTable(db) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY, date TEXT, description TEXT, cents INTEGER, category TEXT)',
  );
  const columns = db.prepare('PRAGMA table_info(transactions)').all();
  if (!columns.some((c) => c.name === 'category')) {
    db.exec('ALTER TABLE transactions ADD COLUMN category TEXT');
  }
}

// The stored row with this id, or undefined. category is the stored key or null.
export function findTransaction(db, id) {
  return db
    .prepare('SELECT id, date, description, cents, category FROM transactions WHERE id = ?')
    .get(id);
}

// Stores key as the category of the row with this id. The caller has checked both.
export function setCategory(db, id, key) {
  db.prepare('UPDATE transactions SET category = ? WHERE id = ?').run(key, id);
}

// The row's stored category, or the one its description gives when none is stored.
export function categoryFor(row) {
  return row.category ? row.category : categoryOf(row.description);
}

// Stores each file row unless the table already holds it. Each key (date,
// trimmed description, cents) starts with the number of matching stored rows;
// a file row is skipped while that count is above zero, otherwise it is inserted.
export function importRows(db, rows) {
  const countStored = db.prepare(
    'SELECT COUNT(*) AS n FROM transactions WHERE date = ? AND description = ? AND cents = ?',
  );
  const insert = db.prepare(
    'INSERT INTO transactions (date, description, cents, category) VALUES (?, ?, ?, ?)',
  );
  const remaining = new Map();
  let added = 0;
  let skipped = 0;

  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const description = r.description.trim();
      const key = JSON.stringify([r.date, description, r.cents]);
      if (!remaining.has(key)) {
        remaining.set(key, countStored.get(r.date, description, r.cents).n);
      }
      const left = remaining.get(key);
      if (left > 0) {
        remaining.set(key, left - 1);
        skipped += 1;
      } else {
        insert.run(r.date, description, r.cents, categoryOf(description));
        added += 1;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { added, skipped };
}
