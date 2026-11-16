// tests/month.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMonth, shiftMonth, monthTotals, withChanges } from '../src/lib/month.js';

const t = (date, description, cents) => ({ date, description, cents });

test('isMonth accepts YYYY-MM with month 01 to 12 only', () => {
  assert.equal(isMonth('2026-08'), true);
  assert.equal(isMonth('2026-12'), true);
  assert.equal(isMonth('2026-8'), false);
  assert.equal(isMonth('2026-13'), false);
  assert.equal(isMonth('2026-00'), false);
  assert.equal(isMonth('2026-08-01'), false);
  assert.equal(isMonth(''), false);
  assert.equal(isMonth(undefined), false);
});

test('shiftMonth moves a month either way, across years', () => {
  assert.equal(shiftMonth('2026-08', -1), '2026-07');
  assert.equal(shiftMonth('2026-08', 1), '2026-09');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('monthTotals sums each category for the month, in category order', () => {
  const rows = [
    t('2026-08-02', 'Greenbarrow Fresh', 4520),
    t('2026-08-06', 'Greenbarrow Fresh', -500),
    t('2026-08-09', 'Pasta, Pizza & Co', 1800),
  ];
  assert.deepEqual(monthTotals(rows, '2026-08'), {
    rows: [
      { key: 'groceries', label: 'Groceries', cents: 4020 },
      { key: 'dining', label: 'Eating out', cents: 1800 },
    ],
    totalCents: 5820,
    count: 3,
  });
});

test('income counts as negative whatever its stored sign', () => {
  const rows = [t('2026-08-10', 'Brightwave Payroll', 300000), t('2026-08-11', 'Tidepool Interest', -1000)];
  const result = monthTotals(rows, '2026-08');
  assert.deepEqual(result.rows, [{ key: 'income', label: 'Income', cents: -301000 }]);
  assert.equal(result.totalCents, -301000);
});

test('a transaction outside the month is left out', () => {
  const rows = [t('2026-07-31', 'Greenbarrow Fresh', 9999), t('2026-08-31', 'Greenbarrow Fresh', 100), t('2026-09-01', 'Greenbarrow Fresh', 9999)];
  assert.deepEqual(monthTotals(rows, '2026-08'), {
    rows: [{ key: 'groceries', label: 'Groceries', cents: 100 }],
    totalCents: 100,
    count: 1,
  });
});

test('a month with no transactions has no rows and a count of zero', () => {
  assert.deepEqual(monthTotals([t('2026-07-31', 'Greenbarrow Fresh', 100)], '2026-08'), {
    rows: [],
    totalCents: 0,
    count: 0,
  });
});

test('a moved row counts in its new category and not its old one', () => {
  const rows = [{ date: '2026-08-02', description: 'Greenbarrow Fresh', cents: -4500, category: 'dining' }];
  assert.deepEqual(monthTotals(rows, '2026-08'), {
    rows: [{ key: 'dining', label: 'Eating out', cents: -4500 }],
    totalCents: -4500,
    count: 1,
  });
});

test('a row with no stored category counts under its shop\'s category', () => {
  const rows = [{ date: '2026-08-02', description: 'Greenbarrow Fresh', cents: -4500, category: null }];
  assert.deepEqual(monthTotals(rows, '2026-08'), {
    rows: [{ key: 'groceries', label: 'Groceries', cents: -4500 }],
    totalCents: -4500,
    count: 1,
  });
});

test('other comes last, after the named categories', () => {
  const rows = [t('2026-08-01', 'Unknown Shop', 500), t('2026-08-02', 'Greenbarrow Fresh', 100)];
  assert.deepEqual(
    monthTotals(rows, '2026-08').rows.map((r) => r.key),
    ['groceries', 'other'],
  );
});

test('withChanges gives each category its change from last month', () => {
  const current = monthTotals([t('2026-08-02', 'Greenbarrow Fresh', 4520)], '2026-08');
  const previous = monthTotals([t('2026-07-02', 'Greenbarrow Fresh', 9999)], '2026-07');
  assert.deepEqual(withChanges(current, previous), {
    rows: [{ key: 'groceries', label: 'Groceries', cents: 4520, change: -5479 }],
    totalCents: 4520,
    totalChange: -5479,
    count: 1,
  });
});

test('a category new this month has a change equal to its whole total', () => {
  const current = monthTotals([t('2026-08-09', 'Pasta, Pizza & Co', 1800)], '2026-08');
  const previous = monthTotals([], '2026-07');
  assert.deepEqual(withChanges(current, previous).rows, [
    { key: 'dining', label: 'Eating out', cents: 1800, change: 1800 },
  ]);
});

test('a category missing this month shows 0 and a change equal to minus last month', () => {
  const current = monthTotals([t('2026-08-02', 'Greenbarrow Fresh', 4520)], '2026-08');
  const previous = monthTotals([t('2026-07-12', 'Waverly Fuel Stop', 1250)], '2026-07');
  assert.deepEqual(withChanges(current, previous).rows, [
    { key: 'groceries', label: 'Groceries', cents: 4520, change: 4520 },
    { key: 'transport', label: 'Transport', cents: 0, change: -1250 },
  ]);
});

test('a category in neither month does not appear, and the rows follow category order', () => {
  const current = monthTotals([t('2026-08-01', 'Unknown Shop', 500), t('2026-08-02', 'Greenbarrow Fresh', 100)], '2026-08');
  const previous = monthTotals([t('2026-07-02', 'Waverly Fuel Stop', 200)], '2026-07');
  assert.deepEqual(
    withChanges(current, previous).rows.map((r) => r.key),
    ['groceries', 'transport', 'other'],
  );
});

test('the grand total change is this month minus last month, and equals the sum of the row changes', () => {
  const current = monthTotals([t('2026-08-02', 'Greenbarrow Fresh', 4520), t('2026-08-10', 'Brightwave Payroll', 300000)], '2026-08');
  const previous = monthTotals([t('2026-07-02', 'Greenbarrow Fresh', 9999)], '2026-07');
  const result = withChanges(current, previous);
  assert.equal(result.totalChange, current.totalCents - previous.totalCents);
  assert.equal(result.rows.reduce((sum, r) => sum + r.change, 0), result.totalChange);
});
