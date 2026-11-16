// src/month-page.js
import { formatCents } from './lib/money.js';
import { escapeHtml } from './lib/html.js';
import { CATEGORIES } from './lib/categories.js';
import { categoryFor } from './lib/store.js';
import { isMonth, shiftMonth, monthTotals, transactionsIn, withChanges } from './lib/month.js';
import { isOn } from './lib/flags.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Builds the month page for the m query value. The body is the page's inner
// HTML; server.js wraps it. Every description is escaped with escapeHtml. The
// edit links show only when the edit-category flag is on.
export function monthPage(db, url, flags) {
  const m = url.searchParams.get('m');
  if (!isMonth(m)) {
    return { status: 400, type: 'text/plain; charset=utf-8', body: 'Month must look like YYYY-MM' };
  }

  const editLinks = isOn(flags, 'edit-category');
  const transactions = db.prepare('SELECT id, date, description, cents, category FROM transactions').all();
  const current = monthTotals(transactions, m);
  const { rows, totalCents, totalChange, count } = withChanges(current, monthTotals(transactions, shiftMonth(m, -1)));
  const [year, month] = m.split('-').map(Number);

  const heading = `<h2>${MONTH_NAMES[month - 1]} ${year}</h2>`;
  const links =
    `<p><a href="/month?m=${shiftMonth(m, -1)}">Previous month</a> · ` +
    `<a href="/month?m=${shiftMonth(m, 1)}">Next month</a></p>`;

  if (count === 0) {
    return { status: 200, type: 'text/html; charset=utf-8', body: `${heading}\n${links}\n<p>No transactions this month</p>` };
  }

  const cell = (key, cents) => `<td data-category="${key}" data-total="${formatCents(cents)}">${formatCents(cents)}</td>`;
  const changeCell = (cents) => `<td data-change="${formatCents(cents)}">${formatCents(cents)}</td>`;
  const categoryRows = rows.map((r) => `<tr><td>${r.label}</td>${cell(r.key, r.cents)}${changeCell(r.change)}</tr>`);
  const allRow = `<tr><th>All categories</th>${cell('all', totalCents)}${changeCell(totalChange)}</tr>`;

  const table = [
    '<table>',
    '<thead><tr><th>Category</th><th>Total</th><th>Change</th></tr></thead>',
    '<tbody>',
    ...categoryRows,
    allRow,
    '</tbody>',
    '</table>',
  ].join('\n');

  const labelOf = (key) => CATEGORIES.find((c) => c.key === key)?.label ?? escapeHtml(key);
  const listRow = (t) => {
    const link = editLinks ? `<td><a href="/edit?id=${t.id}">Change category</a></td>` : '';
    return `<tr><td>${t.date}</td><td>${escapeHtml(t.description)}</td><td>${formatCents(t.cents)}</td><td>${labelOf(categoryFor(t))}</td>${link}</tr>`;
  };
  const listHead = `<tr><th>Date</th><th>Description</th><th>Amount</th><th>Category</th>${editLinks ? '<th></th>' : ''}</tr>`;
  const list = [
    '<table>',
    `<thead>${listHead}</thead>`,
    '<tbody>',
    ...transactionsIn(transactions, m).map(listRow),
    '</tbody>',
    '</table>',
  ].join('\n');

  return { status: 200, type: 'text/html; charset=utf-8', body: `${heading}\n${links}\n${table}\n${list}` };
}
