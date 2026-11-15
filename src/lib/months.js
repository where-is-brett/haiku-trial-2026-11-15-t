// src/lib/months.js

// The YYYY-MM months that have transactions, newest first.
export function listMonths(db) {
  const rows = db
    .prepare('SELECT substr(date, 1, 7) AS month FROM transactions GROUP BY month ORDER BY month DESC')
    .all();
  return rows.map((row) => row.month);
}
