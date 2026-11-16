// tests/edit.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/server.js';
import { importRows, setCategory } from '../src/lib/store.js';
import { CATEGORIES } from '../src/lib/categories.js';

const serve = async (flags) => {
  const db = new DatabaseSync(':memory:');
  const server = createApp({ db, flags });
  await new Promise((resolve) => server.listen(0, resolve));
  return { db, server, base: `http://localhost:${server.address().port}` };
};

const seed = (db, ...rows) => importRows(db, rows);

test('the edit page shows the transaction and a Category select in CATEGORIES order', async () => {
  const { db, server, base } = await serve({ 'edit-category': true });
  try {
    seed(db, { date: '2026-08-02', description: 'Greenbarrow Fresh', cents: -4500 });
    const res = await fetch(`${base}/edit?id=1`);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.match(body, /<input type="hidden" name="id" value="1">/);
    assert.match(body, /<label[^>]*>Category<\/label>/);
    assert.match(body, /<select name="category"/);
    const select = body.slice(body.indexOf('<select name="category"'));
    const values = [...select.slice(0, select.indexOf('</select>')).matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(values, CATEGORIES.map((c) => c.key));
  } finally {
    server.close();
  }
});

test('the select opens on the stored category, else the shop\'s', async () => {
  const { db, server, base } = await serve({ 'edit-category': true });
  try {
    seed(db, { date: '2026-08-02', description: 'Greenbarrow Fresh', cents: -4500 });
    const first = await (await fetch(`${base}/edit?id=1`)).text();
    assert.match(first, /<option value="groceries" selected>/);

    setCategory(db, 1, 'dining');
    const second = await (await fetch(`${base}/edit?id=1`)).text();
    assert.match(second, /<option value="dining" selected>/);
    assert.doesNotMatch(second, /<option value="groceries" selected>/);
  } finally {
    server.close();
  }
});

test('the description is shown escaped', async () => {
  const { db, server, base } = await serve({ 'edit-category': true });
  try {
    seed(db, { date: '2026-08-02', description: '<b>Shop</b> & co', cents: -100 });
    const body = await (await fetch(`${base}/edit?id=1`)).text();
    assert.match(body, /&lt;b&gt;Shop&lt;\/b&gt; &amp; co/);
    assert.doesNotMatch(body, /<b>Shop/);
  } finally {
    server.close();
  }
});

test('an unknown or malformed id gets the error page', async () => {
  const { db, server, base } = await serve({ 'edit-category': true });
  try {
    seed(db, { date: '2026-08-02', description: 'Greenbarrow Fresh', cents: -4500 });
    for (const query of ['id=999', 'id=abc', 'id=1.5', 'id=1abc', '']) {
      const res = await fetch(`${base}/edit?${query}`);
      const body = await res.text();
      assert.equal(res.status, 404, `status for "${query}"`);
      assert.match(body, /No transaction with that id/, `body for "${query}"`);
    }
  } finally {
    server.close();
  }
});

test('with the flag off, /edit is not found', async () => {
  const { db, server, base } = await serve({});
  try {
    seed(db, { date: '2026-08-02', description: 'Greenbarrow Fresh', cents: -4500 });
    const res = await fetch(`${base}/edit?id=1`);
    assert.equal(res.status, 404);
    assert.equal(await res.text(), 'Not found');
  } finally {
    server.close();
  }
});

// Seeds a row and clears its stored category, so it starts as a pre-change row.
const seedUncategorised = (db, row) => {
  seed(db, row);
  db.exec('UPDATE transactions SET category = NULL');
};
const storedCategory = (db, id) =>
  db.prepare('SELECT category FROM transactions WHERE id = ?').get(id).category;
const countCategory = (db, key) =>
  db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE category = ?').get(key).n;

// POSTs an edit form; redirects are not followed, so the 303 is seen.
const postEdit = (base, params) => fetch(`${base}/edit`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(params),
  redirect: 'manual',
});

test('saving a category stores it and redirects to the transaction\'s month', async () => {
  const { db, server, base } = await serve({ 'edit-category': true });
  try {
    seedUncategorised(db, { date: '2026-08-02', description: 'Greenbarrow Fresh', cents: -4500 });
    const res = await postEdit(base, { id: '1', category: 'dining' });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/month?m=2026-08');
    assert.equal(storedCategory(db, 1), 'dining');
  } finally {
    server.close();
  }
});

test('the redirect uses the row\'s own month across a year boundary', async () => {
  const { db, server, base } = await serve({ 'edit-category': true });
  try {
    seedUncategorised(db, { date: '2025-12-31', description: 'Brightfield Power', cents: -9000 });
    const res = await postEdit(base, { id: '1', category: 'bills' });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/month?m=2025-12');
  } finally {
    server.close();
  }
});

test('a category that is not a key is refused and stores nothing', async () => {
  const { db, server, base } = await serve({ 'edit-category': true });
  try {
    seedUncategorised(db, { date: '2026-08-02', description: 'Greenbarrow Fresh', cents: -4500 });
    const res = await postEdit(base, { id: '1', category: 'eating_out' });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /Choose a category from the list/);
    assert.equal(storedCategory(db, 1), null);
  } finally {
    server.close();
  }
});

test('a missing category is refused', async () => {
  const { db, server, base } = await serve({ 'edit-category': true });
  try {
    seedUncategorised(db, { date: '2026-08-02', description: 'Greenbarrow Fresh', cents: -4500 });
    const res = await postEdit(base, { id: '1' });
    assert.equal(res.status, 400);
    assert.equal(storedCategory(db, 1), null);
  } finally {
    server.close();
  }
});

test('an unknown id on save gets the error page and stores nothing', async () => {
  const { db, server, base } = await serve({ 'edit-category': true });
  try {
    seedUncategorised(db, { date: '2026-08-02', description: 'Greenbarrow Fresh', cents: -4500 });
    const res = await postEdit(base, { id: '999', category: 'dining' });
    assert.equal(res.status, 404);
    assert.match(await res.text(), /No transaction with that id/);
    assert.equal(countCategory(db, 'dining'), 0);
  } finally {
    server.close();
  }
});

test('a body over 4 KB is refused with 413', async () => {
  const { db, server, base } = await serve({ 'edit-category': true });
  try {
    seedUncategorised(db, { date: '2026-08-02', description: 'Greenbarrow Fresh', cents: -4500 });
    const body = `${'x'.repeat(5000)}&id=1&category=dining`;
    const res = await fetch(`${base}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'manual',
    });
    assert.equal(res.status, 413);
    assert.equal(storedCategory(db, 1), null);
  } finally {
    server.close();
  }
});

test('with the flag off, a POST to /edit is not found', async () => {
  const { db, server, base } = await serve({});
  try {
    seedUncategorised(db, { date: '2026-08-02', description: 'Greenbarrow Fresh', cents: -4500 });
    const res = await postEdit(base, { id: '1', category: 'dining' });
    assert.equal(res.status, 404);
    assert.equal(await res.text(), 'Not found');
    assert.equal(storedCategory(db, 1), null);
  } finally {
    server.close();
  }
});
