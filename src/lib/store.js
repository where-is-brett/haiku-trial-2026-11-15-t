// src/lib/store.js

export function createTable(db) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY, date TEXT, description TEXT, cents INTEGER)',
  );
}

// Stores each file row unless the table already holds it. Each key (date,
// trimmed description, cents) starts with the number of matching stored rows;
// a file row is skipped while that count is above zero, otherwise it is inserted.
export function importRows(db, rows) {
  const countStored = db.prepare(
    'SELECT COUNT(*) AS n FROM transactions WHERE date = ? AND description = ? AND cents = ?',
  );
  const insert = db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)');
  const remaining = new Map();
  let added = 0;
  let skipped = 0;

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
      insert.run(r.date, description, r.cents);
      added += 1;
    }
  }

  return { added, skipped };
}
