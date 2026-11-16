// tests/export.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { csvField, isMonth, categoryLabel, exportCsv } from '../src/lib/export.js';
import { createTable } from '../src/lib/store.js';

// A fresh in-memory table holding each [date, description, cents] row, in order.
const withRows = (rows) => {
  const db = new DatabaseSync(':memory:');
  createTable(db);
  const insert = db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)');
  for (const [date, description, cents] of rows) {
    insert.run(date, description, cents);
  }
  return db;
};

test('a field with a comma, a double quote or a line break is quoted, quotes doubled', () => {
  assert.equal(csvField('Pasta, Pizza & Co'), '"Pasta, Pizza & Co"');
  assert.equal(csvField('Say "hi"'), '"Say ""hi"""');
  assert.equal(csvField('Line one\nLine two'), '"Line one\nLine two"');
  assert.equal(csvField('Eating out'), 'Eating out');
});

test('isMonth accepts YYYY-MM for months 01 to 12 only', () => {
  assert.equal(isMonth('2026-08'), true);
  assert.equal(isMonth('2026-12'), true);
  for (const bad of ['2026-13', '2026-00', '2026-8', '2026-08-01', '26-08', '', null]) {
    assert.equal(isMonth(bad), false, bad);
  }
});

test('categoryLabel gives the label the month page shows, not the key', () => {
  assert.equal(categoryLabel('Pasta, Pizza & Co'), 'Eating out');
  assert.equal(categoryLabel('Unknown Shop'), 'Other');
});

test('the header, then the month rows in date order then id, with the stored sign', () => {
  const db = withRows([
    ['2026-08-05', 'Pasta, Pizza & Co', 4250],
    ['2026-08-02', 'Pennywhistle Market', 10152],
    ['2026-08-05', 'Brightwave Payroll', -211290],
    ['2026-08-09', 'Hollis Insurance', -12350],
    ['2026-09-01', 'Lowtide Grocers', 580],
  ]);
  assert.equal(
    exportCsv(db, '2026-08'),
    'Date,Description,Amount,Category\r\n'
      + '2026-08-02,Pennywhistle Market,101.52,Groceries\r\n'
      + '2026-08-05,"Pasta, Pizza & Co",42.50,Eating out\r\n'
      + '2026-08-05,Brightwave Payroll,-2112.90,Income\r\n'
      + '2026-08-09,Hollis Insurance,-123.50,Bills\r\n',
  );
});

test('an income row is written negative, and a zero amount is 0.00', () => {
  const db = withRows([
    ['2026-08-03', 'Tidepool Interest', 320],
    ['2026-08-04', 'Brightwave Payroll', -211290],
    ['2026-08-06', 'Pennywhistle Market', 0],
    ['2026-08-07', 'Oakridge Dividends', 0],
  ]);
  const lines = exportCsv(db, '2026-08').split('\r\n');
  assert.equal(lines[1], '2026-08-03,Tidepool Interest,-3.20,Income');
  assert.equal(lines[2], '2026-08-04,Brightwave Payroll,-2112.90,Income');
  assert.equal(lines[3], '2026-08-06,Pennywhistle Market,0.00,Groceries');
  assert.equal(lines[4], '2026-08-07,Oakridge Dividends,0.00,Income');
});

test('a month with no transactions gives the header row only', () => {
  const db = withRows([['2026-09-01', 'Lowtide Grocers', 580]]);
  assert.equal(exportCsv(db, '2026-08'), 'Date,Description,Amount,Category\r\n');
});
