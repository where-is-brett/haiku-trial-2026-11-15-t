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
