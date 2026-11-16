// src/month-page.js
import { formatCents } from './lib/money.js';
import { isMonth, shiftMonth, monthTotals, withChanges } from './lib/month.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Builds the month page for the m query value. The body is the page's inner
// HTML; server.js wraps it. Only m reaches the HTML, and it has passed isMonth
// (digits and a hyphen only), so nothing here needs escaping.
export function monthPage(db, url) {
  const m = url.searchParams.get('m');
  if (!isMonth(m)) {
    return { status: 400, type: 'text/plain; charset=utf-8', body: 'Month must look like YYYY-MM' };
  }

  const transactions = db.prepare('SELECT date, description, cents FROM transactions').all();
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

  return { status: 200, type: 'text/html; charset=utf-8', body: `${heading}\n${links}\n${table}` };
}
