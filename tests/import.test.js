// tests/import.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/server.js';

const serve = async (flags) => {
  const db = new DatabaseSync(':memory:');
  const server = createApp({ db, flags });
  await new Promise((resolve) => server.listen(0, resolve));
  return { db, server, base: `http://localhost:${server.address().port}` };
};

test('GET /import shows the form when the flag is on', async () => {
  const { server, base } = await serve({ 'bank-statement-import': true });
  try {
    const res = await fetch(`${base}/import`);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.match(body, /Upload a statement/);
    assert.match(body, /<input type="file" name="statement">/);
    assert.match(body, /enctype="multipart\/form-data"/);
  } finally {
    server.close();
  }
});

test('GET /import is a 404 while the flag is off', async () => {
  const { server, base } = await serve({ 'bank-statement-import': false });
  try {
    const res = await fetch(`${base}/import`);
    assert.equal(res.status, 404);
    assert.equal(await res.text(), 'Not found');
  } finally {
    server.close();
  }
});
