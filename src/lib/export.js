// src/lib/export.js

import { CATEGORIES, categoryOf } from './categories.js';
import { formatCents } from './money.js';

// Quotes a text as one CSV field when it holds a comma, a double quote or a
// line break, doubling any double quote inside it.
export function csvField(text) {
  const value = String(text);
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// True only for YYYY-MM naming a real month, 01 to 12.
export function isMonth(text) {
  if (text === null || text === undefined) {
    return false;
  }
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(text));
}

// The label the month page shows for a description's category.
export function categoryLabel(description) {
  const key = categoryOf(description);
  const entry = CATEGORIES.find((category) => category.key === key);
  return entry.label;
}

// The whole export file for one month: the header row, then one row per
// transaction in date order then id, each line ending in \r\n. An income row
// is written negative whatever its stored sign.
export function exportCsv(db, month) {
  const rows = db
    .prepare('SELECT id, date, description, cents FROM transactions WHERE substr(date, 1, 7) = ? ORDER BY date, id')
    .all(month);
  const lines = ['Date,Description,Amount,Category'];
  for (const row of rows) {
    const income = categoryOf(row.description) === 'income';
    const cents = income ? -Math.abs(row.cents) : row.cents;
    lines.push([
      row.date,
      csvField(row.description),
      formatCents(cents),
      categoryLabel(row.description),
    ].join(','));
  }
  return lines.map((line) => `${line}\r\n`).join('');
}
