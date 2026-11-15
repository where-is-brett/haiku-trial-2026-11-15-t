// tests/server.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { configFromEnv, createApp } from '../src/server.js';

test('the port and database path come from the environment, with defaults', () => {
  assert.deepEqual(configFromEnv({}), { port: 3000, dbPath: 'ledger.db' });
  assert.deepEqual(configFromEnv({ PORT: '8080', LEDGER_DB: ':memory:' }), { port: 8080, dbPath: ':memory:' });
});

test(':memory: works and the home page answers', async () => {
  const server = createApp({ db: new DatabaseSync(':memory:'), flags: {} });
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const res = await fetch(`http://localhost:${server.address().port}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Nothing imported yet/);
  } finally {
    server.close();
  }
});
