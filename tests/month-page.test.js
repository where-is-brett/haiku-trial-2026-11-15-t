// tests/month-page.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createTable } from '../src/lib/store.js';
import { monthPage } from '../src/month-page.js';
import { createApp } from '../src/server.js';

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
  return db;
};
const get = (db, m) => monthPage(db, new URL(`http://localhost/month?m=${m}`), {});

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
  assert.equal(cells.length, 4);
  for (const [, , total] of cells) assert.match(total, /^-?\d+\.\d{2}$/);
});

test('a category with no transactions this month does not appear', () => {
  const { body } = get(fixture(), '2026-08');
  assert.doesNotMatch(body, /data-category="transport"/);
  assert.doesNotMatch(body, /Transport/);
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
  const missing = monthPage(fixture(), new URL('http://localhost/month'), {});
  assert.equal(missing.status, 400);
});

// Serves the app over the given database; the month page's list and its links
// need the flags, so these tests go through createApp.
const serveMonth = async (db, flags) => {
  const server = createApp({ db, flags });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://localhost:${server.address().port}` };
};
const postEdit = (base, params) => fetch(`${base}/edit`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(params),
  redirect: 'manual',
});
const ON = { 'month-page': true, 'edit-category': true };

test('the month page lists that month\'s rows, each linking to /edit?id=<id>', async () => {
  const { server, base } = await serveMonth(fixture(), ON);
  try {
    const body = await (await fetch(`${base}/month?m=2026-08`)).text();
    // Ids 2 to 6 are the August rows; id 1 is 2026-07-31 and id 7 is 2026-09-01.
    for (const id of [2, 3, 4, 5, 6]) {
      assert.match(body, new RegExp(`<a href="/edit\\?id=${id}">Change category</a>`));
    }
    assert.doesNotMatch(body, /\/edit\?id=1"/);
    assert.doesNotMatch(body, /\/edit\?id=7"/);
  } finally {
    server.close();
  }
});

test('a description in the month list is escaped', async () => {
  const db = new DatabaseSync(':memory:');
  createTable(db);
  db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)')
    .run('2026-08-02', '<b>Shop</b> & co', -100);
  const { server, base } = await serveMonth(db, ON);
  try {
    const body = await (await fetch(`${base}/month?m=2026-08`)).text();
    assert.match(body, /&lt;b&gt;Shop&lt;\/b&gt; &amp; co/);
    assert.doesNotMatch(body, /<b>Shop/);
  } finally {
    server.close();
  }
});

test('the list shows only that month\'s rows', async () => {
  const db = new DatabaseSync(':memory:');
  createTable(db);
  const add = db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)');
  add.run('2026-07-31', 'July Shop', -100);
  add.run('2026-08-01', 'August Shop', -200);
  const { server, base } = await serveMonth(db, ON);
  try {
    const body = await (await fetch(`${base}/month?m=2026-08`)).text();
    assert.match(body, /August Shop/);
    assert.doesNotMatch(body, /July Shop/);
  } finally {
    server.close();
  }
});

test('with edit-category off there are no edit links', async () => {
  const { server, base } = await serveMonth(fixture(), { 'month-page': true });
  try {
    const body = await (await fetch(`${base}/month?m=2026-08`)).text();
    assert.match(body, /Greenbarrow Fresh/);
    assert.doesNotMatch(body, /\/edit\?id=/);
    assert.doesNotMatch(body, /Change category/);
  } finally {
    server.close();
  }
});

test('the month list and total use the row\'s category', async () => {
  const db = new DatabaseSync(':memory:');
  createTable(db);
  db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)')
    .run('2026-08-02', 'Greenbarrow Fresh', -4500);
  const { server, base } = await serveMonth(db, ON);
  try {
    const res = await postEdit(base, { id: '1', category: 'dining' });
    assert.equal(res.status, 303);
    const body = await (await fetch(`${base}/month?m=2026-08`)).text();
    assert.match(body, /<td>2026-08-02<\/td><td>Greenbarrow Fresh<\/td><td>-45\.00<\/td><td>Eating out<\/td>/);
    assert.match(body, /<td data-category="dining" data-total="-45\.00">/);
    assert.match(body, /<td>Eating out<\/td>/);
    assert.doesNotMatch(body, /data-category="groceries"/);
    assert.match(body, /data-category="all" data-total="-45\.00"/);
  } finally {
    server.close();
  }
});
