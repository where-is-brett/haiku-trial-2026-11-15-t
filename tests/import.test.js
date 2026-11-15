// tests/import.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/server.js';

const serve = async (flags) => {
  const db = new DatabaseSync(':memory:');
  const server = createApp({ db, flags });
  await new Promise((resolve) => server.listen(0, resolve));
  return { db, server, base: `http://localhost:${server.address().port}` };
};

const sample = fs.readFileSync(fileURLToPath(new URL('../data/sample-statement.csv', import.meta.url)), 'utf8');
const upload = (text, name = 'statement.csv') => {
  const form = new FormData();
  form.append('statement', new Blob([text]), name);
  return form;
};
const count = (db) => db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n;

// A multipart body of exactly `total` bytes whose statement file is filler.
// The boundary is long: the form parser rejects a one-character boundary.
const BOUNDARY = 'statement-boundary';
const bodyOfSize = (total) => {
  const head = Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="statement"; filename="s.csv"\r\nContent-Type: text/csv\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`);
  return Buffer.concat([head, Buffer.alloc(total - head.length - tail.length, 'x'), tail]);
};
const MAX_BYTES = 5 * 1024 * 1024;

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

const postForm = (base, form) => fetch(`${base}/import`, { method: 'POST', body: form });
const postRaw = (base, body, contentType) => fetch(`${base}/import`, {
  method: 'POST',
  headers: { 'content-type': contentType },
  body,
});

test('POST /import stores a statement, then skips it when posted again', async () => {
  const { db, server, base } = await serve({ 'bank-statement-import': true });
  try {
    const first = await postForm(base, upload(sample));
    const firstBody = await first.text();
    assert.equal(first.status, 200);
    assert.match(firstBody, /Added 128, skipped 0/);

    const second = await postForm(base, upload(sample));
    const secondBody = await second.text();
    assert.equal(second.status, 200);
    assert.match(secondBody, /Added 0, skipped 128/);

    assert.equal(count(db), 128);
  } finally {
    server.close();
  }
});

test('POST /import refuses a file that is not a statement and stores nothing', async () => {
  const { db, server, base } = await serve({ 'bank-statement-import': true });
  try {
    const res = await postForm(base, upload('Name,Total\nA,1'));
    assert.equal(res.status, 400);
    assert.match(await res.text(), /Not a bank statement/);
    assert.equal(count(db), 0);
  } finally {
    server.close();
  }
});

test('POST /import refuses a statement with a bad row and stores nothing', async () => {
  const { db, server, base } = await serve({ 'bank-statement-import': true });
  try {
    const text = 'Date,Description,Amount\n02/08/2026,A,1.00\n03/08/2026,B\n04/08/2026,C,2.00\n';
    const res = await postForm(base, upload(text));
    assert.equal(res.status, 400);
    assert.match(await res.text(), /Line 3: needs three fields/);
    assert.equal(count(db), 0);
  } finally {
    server.close();
  }
});

test('POST /import accepts a body of exactly 5 MB by size and refuses its content', async () => {
  const { db, server, base } = await serve({ 'bank-statement-import': true });
  try {
    const res = await postRaw(base, bodyOfSize(MAX_BYTES), `multipart/form-data; boundary=${BOUNDARY}`);
    assert.equal(res.status, 400);
    assert.match(await res.text(), /Not a bank statement/);
    assert.equal(count(db), 0);
  } finally {
    server.close();
  }
});

test('POST /import refuses a body one byte over 5 MB with 413 and stores nothing', async () => {
  const { db, server, base } = await serve({ 'bank-statement-import': true });
  try {
    const res = await postRaw(base, bodyOfSize(MAX_BYTES + 1), `multipart/form-data; boundary=${BOUNDARY}`);
    assert.equal(res.status, 413);
    assert.match(await res.text(), /The file is larger than 5 MB/);
    assert.equal(count(db), 0);
  } finally {
    server.close();
  }
});

test('POST /import refuses a plain-text body and still answers the next request', async () => {
  const { server, base } = await serve({ 'bank-statement-import': true });
  try {
    const res = await postRaw(base, 'Date,Description,Amount', 'text/plain');
    assert.equal(res.status, 400);
    assert.match(await res.text(), /Choose a statement file/);

    const next = await fetch(`${base}/import`);
    assert.equal(next.status, 200);
  } finally {
    server.close();
  }
});

test('POST /import refuses a form with no statement file', async () => {
  const { server, base } = await serve({ 'bank-statement-import': true });
  try {
    const form = new FormData();
    form.append('other', 'not a file');
    const res = await postForm(base, form);
    assert.equal(res.status, 400);
    assert.match(await res.text(), /Choose a statement file/);
  } finally {
    server.close();
  }
});

test('POST /import is a 404 while the flag is off and stores nothing', async () => {
  const { db, server, base } = await serve({ 'bank-statement-import': false });
  try {
    const res = await postForm(base, upload(sample));
    assert.equal(res.status, 404);
    assert.equal(await res.text(), 'Not found');
    assert.equal(count(db), 0);
  } finally {
    server.close();
  }
});
