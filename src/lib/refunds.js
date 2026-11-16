// src/lib/refunds.js
import { REFUND_SHAPE } from './statement.js';

// Turns each stored refund that was imported as spending into money back, the
// way the import now stores a REFUND line. Rows imported before that rule kept a
// positive sign. Returns how many rows changed. The caller runs it in a transaction.
export function correctStoredRefunds(db) {
  const candidates = db.prepare('SELECT id, description, cents FROM transactions WHERE cents > 0').all();
  const update = db.prepare('UPDATE transactions SET cents = ? WHERE id = ?');
  let changed = 0;
  for (const row of candidates) {
    if (REFUND_SHAPE.test(row.description)) {
      update.run(-row.cents, row.id);
      changed += 1;
    }
  }
  return changed;
}
