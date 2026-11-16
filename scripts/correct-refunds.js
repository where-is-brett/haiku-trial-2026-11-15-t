// scripts/correct-refunds.js
// Usage: node scripts/correct-refunds.js <path to the ledger database>
// Copies the database to <path>.before-refund-fix first, then turns each stored
// refund imported as spending into money back, in one transaction. Stop the
// server before running it.
import { copyFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { correctStoredRefunds } from '../src/lib/refunds.js';

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('Usage: node scripts/correct-refunds.js <path to the ledger database>');
  process.exit(1);
}

const backupPath = `${dbPath}.before-refund-fix`;
copyFileSync(dbPath, backupPath);

const db = new DatabaseSync(dbPath);
db.exec('BEGIN');
try {
  const changed = correctStoredRefunds(db);
  db.exec('COMMIT');
  console.log(`Corrected ${changed} stored refund rows. Backup: ${backupPath}`);
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}
