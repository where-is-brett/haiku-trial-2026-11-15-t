// src/lib/refunds.js
import { copyFileSync, constants, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { REFUND_SHAPE } from './statement.js';

// The stored refunds imported as spending: positive rows whose description is a REFUND.
function spendingRefunds(db) {
  return db
    .prepare('SELECT id, date, description, cents FROM transactions WHERE cents > 0')
    .all()
    .filter((row) => REFUND_SHAPE.test(row.description));
}

// Stored refunds whose money-back row already exists. Correcting one would leave
// two rows for one refund, so the director decides which to remove first.
export function refundDuplicates(db) {
  const countBack = db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE date = ? AND description = ? AND cents = ?');
  return spendingRefunds(db)
    .filter((row) => countBack.get(row.date, row.description, -row.cents).n > 0)
    .map(({ date, description, cents }) => ({ date, description, cents }));
}

// Turns each stored refund that was imported as spending into money back, the way
// the import now stores a REFUND line. Returns how many rows changed. The caller
// runs it inside a transaction.
export function correctStoredRefunds(db) {
  const update = db.prepare('UPDATE transactions SET cents = ? WHERE id = ?');
  const refunds = spendingRefunds(db);
  for (const row of refunds) update.run(-row.cents, row.id);
  return refunds.length;
}

// Corrects the ledger file at dbPath, all or nothing. It refuses to run when a
// backup already exists or when a correction would duplicate a row, and it
// returns { duplicates } without writing in that case. Otherwise it copies the
// file to <dbPath>.before-refund-fix while holding the write lock, then corrects
// the rows and returns { changed, backupPath }.
export function correctRefundFile(dbPath) {
  const backupPath = `${dbPath}.before-refund-fix`;
  if (existsSync(backupPath)) {
    throw new Error(`A backup already exists at ${backupPath}; move it aside before running again`);
  }
  const db = new DatabaseSync(dbPath);
  db.exec('BEGIN IMMEDIATE');
  try {
    const duplicates = refundDuplicates(db);
    if (duplicates.length > 0) {
      db.exec('ROLLBACK');
      return { duplicates };
    }
    copyFileSync(dbPath, backupPath, constants.COPYFILE_EXCL);
    const changed = correctStoredRefunds(db);
    db.exec('COMMIT');
    return { changed, backupPath };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}
