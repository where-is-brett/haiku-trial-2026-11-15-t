// tests/month-page.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createTable } from '../src/lib/store.js';
import { monthPage } from '../src/month-page.js';

const fixture = () => {
  const db = new DatabaseSync(':memory:');
  createTable(db);
  const add = db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)');
  add.run('2026-07-31', 'Greenbarrow Fresh', 9999);
  add.run('2026-08-02', 'Greenbarrow Fresh', 4520);
  add.run('2026-08-06', 'Greenbarrow Fresh', -500);
  add.run('2026-08-09', 'Pasta, Pizza & Co', 1800);
  add.run('2026-08-10', 'Brightwave Payroll', 300000);
  add.run('2026-08-11', 'Tidepool Interest', -1000);
  add.run('2026-09-01', 'Greenbarrow Fresh', 9999);
  add.run('2026-07-12', 'Waverly Fuel Stop', 1250);
  return db;
};
const get = (db, m) => monthPage(db, new URL(`http://localhost/month?m=${m}`));

test('the month page shows each category total and the grand total', () => {
  const { status, type, body } = get(fixture(), '2026-08');
  assert.equal(status, 200);
  assert.equal(type, 'text/html; charset=utf-8');
  assert.match(body, /<td>Groceries<\/td><td data-category="groceries" data-total="40\.20">40\.20<\/td>/);
  assert.match(body, /data-category="dining" data-total="18\.00"/);
  assert.match(body, /data-category="income" data-total="-3010\.00"/);
  assert.match(body, /data-category="all" data-total="-2951\.80"/);
});

test('every total cell carries a category and a plain decimal', () => {
  const { body } = get(fixture(), '2026-08');
  const cells = [...body.matchAll(/data-category="([^"]+)" data-total="([^"]*)"/g)];
  assert.equal(cells.length, 5);
  for (const [, , total] of cells) assert.match(total, /^-?\d+\.\d{2}$/);
});

test('a category with no transactions in either month does not appear', () => {
  const { body } = get(fixture(), '2026-08');
  assert.doesNotMatch(body, /data-category="bills"/);
  assert.doesNotMatch(body, /Bills/);
});

test('each category row carries its change from last month', () => {
  const { body } = get(fixture(), '2026-08');
  assert.match(body, /data-category="groceries" data-total="40\.20">40\.20<\/td><td data-change="-59\.79">/);
  assert.match(body, /data-category="dining" data-total="18\.00">18\.00<\/td><td data-change="18\.00">/);
  assert.match(body, /data-category="income" data-total="-3010\.00">-3010\.00<\/td><td data-change="-3010\.00">/);
});

test('a category missing this month shows 0.00 and minus last month as its change', () => {
  const { body } = get(fixture(), '2026-08');
  assert.match(body, /<td>Transport<\/td><td data-category="transport" data-total="0\.00">0\.00<\/td><td data-change="-12\.50">/);
});

test('the grand total change is this month minus last month', () => {
  const { body } = get(fixture(), '2026-08');
  assert.match(body, /data-category="all" data-total="-2951\.80">-2951\.80<\/td><td data-change="-3064\.29">/);
});

test('every change cell carries a plain decimal and there is one per row', () => {
  const { body } = get(fixture(), '2026-08');
  const cells = [...body.matchAll(/data-change="([^"]*)"/g)];
  assert.equal(cells.length, 5);
  for (const [, change] of cells) assert.match(change, /^-?\d+\.\d{2}$/);
});

test('the change crosses a year boundary', () => {
  const db = fixture();
  db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)').run('2026-12-03', 'Greenbarrow Fresh', 1000);
  db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)').run('2027-01-04', 'Greenbarrow Fresh', 2500);
  const { body } = get(db, '2027-01');
  assert.match(body, /data-category="groceries" data-total="25\.00">25\.00<\/td><td data-change="15\.00">/);
});

test('the month links go to the month before and after', () => {
  const { body } = get(fixture(), '2026-08');
  assert.match(body, /href="\/month\?m=2026-07"/);
  assert.match(body, /href="\/month\?m=2026-09"/);
});

test('a month with no transactions says so and still has the links', () => {
  const { status, body } = get(fixture(), '2026-03');
  assert.equal(status, 200);
  assert.match(body, /No transactions this month/);
  assert.doesNotMatch(body, /<table/);
  assert.match(body, /href="\/month\?m=2026-02"/);
  assert.match(body, /href="\/month\?m=2026-04"/);
});

test('the links cross a year boundary', () => {
  const { body } = get(fixture(), '2026-12');
  assert.match(body, /href="\/month\?m=2026-11"/);
  assert.match(body, /href="\/month\?m=2027-01"/);
});

test('a malformed m gets a plain error', () => {
  for (const bad of ['2026-8', '2026-13', '', 'august', '2026-08-01']) {
    const { status, type, body } = get(fixture(), bad);
    assert.equal(status, 400, bad);
    assert.equal(type, 'text/plain; charset=utf-8');
    assert.equal(body, 'Month must look like YYYY-MM');
  }
  const missing = monthPage(fixture(), new URL('http://localhost/month'));
  assert.equal(missing.status, 400);
});
