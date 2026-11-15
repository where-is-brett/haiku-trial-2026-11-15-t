// tests/home.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createTable } from '../src/lib/store.js';
import { createApp } from '../src/server.js';

const serve = async (flags, dates = []) => {
  const db = new DatabaseSync(':memory:');
  createTable(db);
  const insert = db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)');
  dates.forEach((date, i) => insert.run(date, `Row ${i}`, 100));
  const server = createApp({ db, flags });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://localhost:${server.address().port}` };
};

test('with the flag on, the months are listed newest first with links', async () => {
  const { server, base } = await serve({ 'bank-statement-import': true }, ['2026-08-02', '2026-10-31']);
  try {
    const body = await (await fetch(`${base}/`)).text();
    assert.match(body, /<a href="\/month\?m=2026-10">2026-10<\/a>[\s\S]*<a href="\/month\?m=2026-08">2026-08<\/a>/);
  } finally {
    server.close();
  }
});

test('with the flag off, the home page has no month list', async () => {
  const { server, base } = await serve({ 'bank-statement-import': false }, ['2026-08-02']);
  try {
    const body = await (await fetch(`${base}/`)).text();
    assert.doesNotMatch(body, /\/month\?m=/);
    assert.match(body, /1 transactions imported/);
  } finally {
    server.close();
  }
});

test('with the flag on and no transactions, the home page shows Nothing imported yet and no list', async () => {
  const { server, base } = await serve({ 'bank-statement-import': true }, []);
  try {
    const body = await (await fetch(`${base}/`)).text();
    assert.match(body, /Nothing imported yet/);
    assert.doesNotMatch(body, /\/month\?m=/);
  } finally {
    server.close();
  }
});
