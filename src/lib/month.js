// src/lib/month.js
import { CATEGORIES } from './categories.js';
import { monthOf } from './dates.js';
import { categoryFor } from './store.js';

// True only for 'YYYY-MM' with a month from 01 to 12.
export function isMonth(text) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(text));
}

// The month delta months from m ('YYYY-MM'); a negative delta goes back.
export function shiftMonth(m, delta) {
  const [year, month] = m.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;
  const shiftedYear = Math.floor(index / 12);
  const shiftedMonth = index - shiftedYear * 12 + 1;
  return `${shiftedYear}-${String(shiftedMonth).padStart(2, '0')}`;
}

// The transactions dated in month m, in date, id order.
export function transactionsIn(transactions, m) {
  return transactions
    .filter((t) => monthOf(t.date) === m)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}

// Totals the transactions dated in month m, by category, in CATEGORIES order.
// Each row is keyed by categoryFor: its stored category, else its shop's.
// Income counts as negative whatever its stored sign.
export function monthTotals(transactions, m) {
  const inMonth = transactionsIn(transactions, m);
  const sums = new Map();
  let totalCents = 0;
  for (const t of inMonth) {
    const key = categoryFor(t);
    const counted = key === 'income' ? -Math.abs(t.cents) : t.cents;
    sums.set(key, (sums.get(key) ?? 0) + counted);
    totalCents += counted;
  }
  const rows = CATEGORIES.filter((c) => sums.has(c.key)).map((c) => ({
    key: c.key,
    label: c.label,
    cents: sums.get(c.key),
  }));
  return { rows, totalCents, count: inMonth.length };
}

// Joins this month's totals with last month's: one row per category in either
// month, in CATEGORIES order, each with its change from the month before.
export function withChanges(current, previous) {
  const now = new Map(current.rows.map((r) => [r.key, r.cents]));
  const before = new Map(previous.rows.map((r) => [r.key, r.cents]));
  const rows = CATEGORIES.filter((c) => now.has(c.key) || before.has(c.key)).map((c) => {
    const cents = now.get(c.key) ?? 0;
    return { key: c.key, label: c.label, cents, change: cents - (before.get(c.key) ?? 0) };
  });
  return {
    rows,
    totalCents: current.totalCents,
    totalChange: current.totalCents - previous.totalCents,
    count: current.count,
  };
}
