// scripts/correct-refunds.js
// Usage: node scripts/correct-refunds.js <path to the ledger database>
// Copies the database to <path>.before-refund-fix, then turns each stored refund
// imported as spending into money back, all in one transaction. It changes nothing
// when a backup already exists or when a refund already has its money-back row.
// Stop the server before running it.
import { correctRefundFile } from '../src/lib/refunds.js';

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('Usage: node scripts/correct-refunds.js <path to the ledger database>');
  process.exit(1);
}

let result;
try {
  result = correctRefundFile(dbPath);
} catch (error) {
  console.error(`Not changed. ${error.message}`);
  process.exit(1);
}
if (result.duplicates) {
  console.error('Not changed. These stored refunds already have a money-back row, so correcting them would count each twice:');
  for (const d of result.duplicates) console.error(`  ${d.date}  ${d.description}  ${d.cents}`);
  console.error('Remove one row of each pair by hand, then run this again.');
  process.exit(2);
}
console.log(`Corrected ${result.changed} stored refund rows. Backup: ${result.backupPath}`);
